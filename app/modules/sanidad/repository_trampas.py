"""
PalmaData · Sanidad · Trampas · Repositorio
===========================================
Sobre plantacion.santrampalectura. Sin erróneos ni duplicados.
Filtros: fecha del evento, actualización, lote, trabajador y trampa.
Corrección solo unitaria: el lote no es un campo del registro, se deriva
de la trampa, así que no hay corrección de lote en bloque.
"""
from ...core import db


# ============================================================
#  CATÁLOGOS
# ============================================================

def listar_evaluadores() -> list[dict]:
    return db.fetch_all("""
        SELECT evaluador_codigo, nombre, lecturas, desde, hasta
        FROM plantacion.v_trampas_evaluadores
        ORDER BY nombre NULLS LAST
    """)


def listar_lotes(busqueda: str | None = None, limite: int = 500) -> list[dict]:
    if busqueda and busqueda.strip():
        return db.fetch_all("""
            SELECT cat_lote_id, nombre FROM plantacion.cat_lote
            WHERE nombre ILIKE %s ORDER BY nombre LIMIT %s
        """, (f"%{busqueda.strip()}%", limite))
    return db.fetch_all("""
        SELECT cat_lote_id, nombre FROM plantacion.cat_lote
        ORDER BY nombre LIMIT %s
    """, (limite,))


def listar_trampas(busqueda: str | None = None, limite: int = 500) -> list[dict]:
    """Trampas por código, con su lote, para el filtro y el modal."""
    if busqueda and busqueda.strip():
        return db.fetch_all("""
            SELECT santrampaid, codigo, cat_lote_id, lote
            FROM plantacion.v_cat_trampas
            WHERE codigo ILIKE %s ORDER BY codigo LIMIT %s
        """, (f"%{busqueda.strip()}%", limite))
    return db.fetch_all("""
        SELECT santrampaid, codigo, cat_lote_id, lote
        FROM plantacion.v_cat_trampas ORDER BY codigo LIMIT %s
    """, (limite,))


def fechas_disponibles(limite: int = 90) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha, COUNT(*) AS registros
        FROM plantacion.v_trampas_revision
        WHERE NOT anulado
        GROUP BY fecha ORDER BY fecha DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha_actualizacion AS fecha, COUNT(*) AS registros
        FROM plantacion.v_trampas_revision
        GROUP BY fecha_actualizacion
        ORDER BY fecha_actualizacion DESC LIMIT %s
    """, (limite,))


# ============================================================
#  REVISIÓN
# ============================================================

_FILTROS = """
    WHERE (%s::date IS NULL OR v.fecha >= %s::date)
      AND (%s::date IS NULL OR v.fecha <= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion >= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion <= %s::date)
      AND (%s::bigint IS NULL OR v.cat_lote_id = %s::bigint)
      AND (%s::integer IS NULL OR v.evaluador_codigo = %s::integer)
      AND (%s::integer IS NULL OR v.santrampaid = %s::integer)
"""

_ORDEN = ["fecha_desde", "fecha_hasta", "actualiza_desde", "actualiza_hasta",
          "cat_lote_id", "evaluador", "santrampaid"]


def _params(f: dict) -> list:
    """Cada filtro va dos veces: para el IS NULL y para la comparación."""
    salida: list = []
    for clave in _ORDEN:
        salida.extend([f.get(clave), f.get(clave)])
    return salida


def revision(filtros: dict, ver_anulados: bool = False,
             limite: int = 1000) -> list[dict]:
    """`ver_anulados` muestra SOLO los anulados, no los suma a la lista."""
    sql = """
        SELECT v.santrampalecturaid, v.id_unico, v.lectura, v.fecha, v.hora,
               v.trampa, v.santrampaid, v.lote,
               v.hembras, v.machos, v.total,
               v.trabajador, v.nolectura, v.observaciones,
               v.feromona, v.atrayente,
               v.anulado, v.fecha_actualizacion,
               v.corregido_por, v.corregido_at,
               v.anulado_por, v.anulado_motivo,
               v.cat_lote_id, v.evaluador_codigo
        FROM plantacion.v_trampas_revision v
    """ + _FILTROS
    params = _params(filtros)

    sql += " AND v.anulado" if ver_anulados else " AND NOT v.anulado"
    sql += " ORDER BY v.fecha DESC, v.hora, v.lote, v.trampa LIMIT %s"
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def resumen(filtros: dict) -> dict:
    fila = db.fetch_one("""
        SELECT * FROM plantacion.trampas_resumen(
            %s::date, %s::date, %s::date, %s::date,
            %s::bigint, %s::integer, %s::integer)
    """, tuple(filtros.get(k) for k in _ORDEN))
    return dict(fila) if fila else {}


# ============================================================
#  CORRECCIONES
# ============================================================

def corregir_registro(id_registro: int, usuario: str, campos: dict) -> int:
    """Corrige un registro campo a campo. Los None no se tocan."""
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.trampas_corregir_registro(
                %s, %s::text, %s::integer, %s::integer, %s::integer,
                %s::varchar, %s::varchar, %s::integer) AS n
        """, (id_registro, usuario,
              campos.get("santrampaid"), campos.get("hembras"),
              campos.get("machos"), campos.get("observaciones"),
              campos.get("feromona"), campos.get("atrayente")))
        return (cur.fetchone() or {}).get("n", 0)


def anular(ids: list[int], usuario: str, motivo: str | None = None) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.trampas_anular(%s, %s::text, %s::varchar) AS n",
                    (ids, usuario, motivo))
        return (cur.fetchone() or {}).get("n", 0)


def reactivar(ids: list[int], usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.trampas_reactivar(%s, %s::text) AS n",
                    (ids, usuario))
        return (cur.fetchone() or {}).get("n", 0)


# ============================================================
#  CONSOLIDADO
# ============================================================

def consolidado(fecha_desde, fecha_hasta,
                actualiza_desde=None, actualiza_hasta=None) -> list[dict]:
    return db.fetch_all("""
        SELECT c."LECTURA"          AS lectura,
               c."FECHA"            AS fecha,
               c."HORA"             AS hora,
               c."TRAMPA"           AS trampa,
               c."LOTE"             AS lote,
               c."HEMBRAS"          AS hembras,
               c."MACHOS"           AS machos,
               c."EVALUADOR"        AS evaluador,
               c."SIN LECTURA"      AS nolectura,
               c."OBSERVACIONES"    AS observaciones,
               c."CAMBIO FEROMONA"  AS feromona,
               c."CAMBIO ATRAYENTE" AS atrayente
        FROM plantacion.v_trampas_consolidado c
        WHERE (%s::date IS NULL OR c.fecha_filtro >= %s::date)
          AND (%s::date IS NULL OR c.fecha_filtro <= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro >= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro <= %s::date)
        ORDER BY c.fecha_filtro, c."LOTE", c."TRAMPA", c."HORA"
    """, (fecha_desde, fecha_desde, fecha_hasta, fecha_hasta,
          actualiza_desde, actualiza_desde, actualiza_hasta, actualiza_hasta))
