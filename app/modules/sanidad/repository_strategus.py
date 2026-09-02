"""
PalmaData · Sanidad · Strategus · Repositorio
=============================================
Réplica del patrón del censo sobre plantacion.sanstrategus: con erróneos
(catpalmaid contra cat_palma), sin duplicados; filtros de fecha del evento,
actualización, lote y trabajador. El sector se deriva del lote.
"""
from ...core import db


# ============================================================
#  CATÁLOGOS
# ============================================================

def listar_evaluadores() -> list[dict]:
    return db.fetch_all("""
        SELECT evaluador_codigo, nombre, lecturas, desde, hasta
        FROM plantacion.v_strategus_evaluadores
        ORDER BY nombre NULLS LAST
    """)


def listar_lotes(busqueda: str | None = None, limite: int = 500) -> list[dict]:
    """Lotes con su sector, para el filtro y el modal."""
    base = """
        SELECT l.cat_lote_id, l.nombre, sc.nombre AS sector
        FROM plantacion.cat_lote l
        LEFT JOIN plantacion.cat_sector sc ON sc.cat_sector_id = l.sector0
    """
    if busqueda and busqueda.strip():
        return db.fetch_all(base + " WHERE l.nombre ILIKE %s ORDER BY l.nombre LIMIT %s",
                            (f"%{busqueda.strip()}%", limite))
    return db.fetch_all(base + " ORDER BY l.nombre LIMIT %s", (limite,))


def fechas_disponibles(limite: int = 90) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha, COUNT(*) AS registros
        FROM plantacion.v_strategus_revision
        WHERE NOT anulado
        GROUP BY fecha ORDER BY fecha DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha_actualizacion AS fecha, COUNT(*) AS registros
        FROM plantacion.v_strategus_revision
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
"""

_ORDEN = ["fecha_desde", "fecha_hasta", "actualiza_desde",
          "actualiza_hasta", "cat_lote_id", "evaluador"]


def _params(f: dict) -> list:
    salida: list = []
    for clave in _ORDEN:
        salida.extend([f.get(clave), f.get(clave)])
    return salida


def revision(filtros: dict, ver_anulados: bool = False,
             solo_erroneos: bool = False, limite: int = 1000) -> list[dict]:
    sql = """
        SELECT v.sanstrategusid, v.id_unico, v.sector, v.lote, v.lectura,
               v.fecha, v.hora, v.linea, v.palma, v.catpalmaid, v.galerias,
               v.trabajador, v.observaciones,
               v.erroneo, v.anulado, v.fecha_actualizacion,
               v.corregido_por, v.corregido_at,
               v.anulado_por, v.anulado_motivo,
               v.cat_lote_id, v.cat_sector_id, v.evaluador_codigo
        FROM plantacion.v_strategus_revision v
    """ + _FILTROS
    params = _params(filtros)

    sql += " AND v.anulado" if ver_anulados else " AND NOT v.anulado"
    if solo_erroneos:
        sql += " AND v.erroneo"

    sql += " ORDER BY v.fecha DESC, v.sector, v.lote, v.linea, v.palma LIMIT %s"
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def resumen(filtros: dict) -> dict:
    fila = db.fetch_one("""
        SELECT * FROM plantacion.strategus_resumen(
            %s::date, %s::date, %s::date, %s::date, %s::bigint, %s::integer)
    """, tuple(filtros.get(k) for k in _ORDEN))
    return dict(fila) if fila else {}


# ============================================================
#  CORRECCIONES
# ============================================================

def corregir_lote(ids: list[int], cat_lote_id: int, usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.strategus_corregir_lote(%s, %s, %s::text) AS n",
                    (ids, cat_lote_id, usuario))
        return (cur.fetchone() or {}).get("n", 0)


def corregir_registro(id_registro: int, usuario: str, campos: dict) -> int:
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.strategus_corregir_registro(
                %s, %s::text, %s::bigint, %s::integer, %s::integer, %s::integer) AS n
        """, (id_registro, usuario, campos.get("cat_lote_id"),
              campos.get("linea"), campos.get("palma"), campos.get("galerias")))
        return (cur.fetchone() or {}).get("n", 0)


def anular(ids: list[int], usuario: str, motivo: str | None = None) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.strategus_anular(%s, %s::text, %s::varchar) AS n",
                    (ids, usuario, motivo))
        return (cur.fetchone() or {}).get("n", 0)


def reactivar(ids: list[int], usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.strategus_reactivar(%s, %s::text) AS n",
                    (ids, usuario))
        return (cur.fetchone() or {}).get("n", 0)


# ============================================================
#  CONSOLIDADO
# ============================================================

def consolidado(fecha_desde, fecha_hasta,
                actualiza_desde=None, actualiza_hasta=None) -> list[dict]:
    return db.fetch_all("""
        SELECT c."SECTOR"    AS sector,
               c."LOTE"      AS lote,
               c."LECTURA"   AS lectura,
               c."FECHA"     AS fecha,
               c."LINEA"     AS linea,
               c."PALMA"     AS palma,
               c."GALERIAS"  AS galerias,
               c."EVALUADOR" AS evaluador,
               c."GEOM"      AS geom
        FROM plantacion.v_strategus_consolidado c
        WHERE (%s::date IS NULL OR c.fecha_filtro >= %s::date)
          AND (%s::date IS NULL OR c.fecha_filtro <= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro >= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro <= %s::date)
        ORDER BY c.fecha_filtro, c."SECTOR", c."LOTE", c."LINEA", c."PALMA"
    """, (fecha_desde, fecha_desde, fecha_hasta, fecha_hasta,
          actualiza_desde, actualiza_desde, actualiza_hasta, actualiza_hasta))
