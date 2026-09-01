"""
PalmaData · Sanidad · Plagas · Repositorio
==========================================
Réplica del patrón del censo sobre plantacion.sanplagaslectura:
  · con erróneos (palma inexistente), sin duplicados
  · filtros: fecha del evento, actualización, lote y trabajador

Las correcciones se delegan a las funciones de la base (plagas_corregir_*,
plagas_anular, plagas_reactivar), que validan y dejan constancia en
corregido_por / corregido_at.
"""
from ...core import db


# ============================================================
#  CATÁLOGOS
# ============================================================

def listar_insectos() -> list[dict]:
    return db.fetch_all("SELECT id, insecto FROM plantacion.v_cat_insectos")


def listar_estados_insecto() -> list[dict]:
    return db.fetch_all("SELECT id, estado FROM plantacion.v_cat_estados_insecto")


def listar_evaluadores() -> list[dict]:
    return db.fetch_all("""
        SELECT evaluador_codigo, nombre, lecturas, desde, hasta
        FROM plantacion.v_plagas_evaluadores
        ORDER BY nombre NULLS LAST
    """)


def listar_lotes(busqueda: str | None = None, limite: int = 500) -> list[dict]:
    """Lotes para los buscadores. Directo de cat_lote."""
    if busqueda and busqueda.strip():
        return db.fetch_all("""
            SELECT cat_lote_id, nombre FROM plantacion.cat_lote
            WHERE nombre ILIKE %s ORDER BY nombre LIMIT %s
        """, (f"%{busqueda.strip()}%", limite))
    return db.fetch_all("""
        SELECT cat_lote_id, nombre FROM plantacion.cat_lote
        ORDER BY nombre LIMIT %s
    """, (limite,))


def fechas_disponibles(limite: int = 90) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha, COUNT(*) AS registros
        FROM plantacion.v_plagas_revision
        WHERE NOT anulado
        GROUP BY fecha ORDER BY fecha DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha_actualizacion AS fecha, COUNT(*) AS registros
        FROM plantacion.v_plagas_revision
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


def _params(f: dict) -> list:
    """Cada filtro va dos veces: para el IS NULL y para la comparación."""
    orden = ["fecha_desde", "fecha_hasta", "actualiza_desde",
             "actualiza_hasta", "cat_lote_id", "evaluador"]
    salida: list = []
    for clave in orden:
        salida.extend([f.get(clave), f.get(clave)])
    return salida


def revision(filtros: dict, ver_anulados: bool = False,
             solo_erroneos: bool = False, limite: int = 1000) -> list[dict]:
    """
    Registros para revisar. `ver_anulados` muestra SOLO los anulados;
    `solo_erroneos` deja las palmas que no existen en el catálogo.
    """
    sql = """
        SELECT v.sanplagaslecturaid, v.id_unico, v.lectura, v.fecha, v.hora,
               v.lote, v.linea, v.palma, v.catpalmaid,
               v.insecto, v.insectoid, v.estado_insecto, v.estadoinsectoid,
               v.cantidad, v.nivfoliar,
               v.defol5, v.defol13, v.defol21, v.defol29, v.defol37,
               v.trabajador, v.observaciones,
               v.erroneo, v.anulado, v.fecha_actualizacion,
               v.corregido_por, v.corregido_at,
               v.anulado_por, v.anulado_motivo,
               v.cat_lote_id, v.evaluador_codigo
        FROM plantacion.v_plagas_revision v
    """ + _FILTROS
    params = _params(filtros)

    sql += " AND v.anulado" if ver_anulados else " AND NOT v.anulado"
    if solo_erroneos:
        sql += " AND v.erroneo"

    sql += " ORDER BY v.fecha DESC, v.hora, v.lote, v.linea, v.palma LIMIT %s"
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def resumen(filtros: dict) -> dict:
    fila = db.fetch_one("""
        SELECT * FROM plantacion.plagas_resumen(
            %s::date, %s::date, %s::date, %s::date, %s::bigint, %s::integer)
    """, (filtros.get("fecha_desde"), filtros.get("fecha_hasta"),
          filtros.get("actualiza_desde"), filtros.get("actualiza_hasta"),
          filtros.get("cat_lote_id"), filtros.get("evaluador")))
    return dict(fila) if fila else {}


# ============================================================
#  CORRECCIONES
# ============================================================

def corregir_lote(ids: list[int], cat_lote_id: int, usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.plagas_corregir_lote(%s, %s, %s::text) AS n",
                    (ids, cat_lote_id, usuario))
        return (cur.fetchone() or {}).get("n", 0)


def corregir_registro(id_registro: int, usuario: str, campos: dict) -> int:
    """Corrige un registro campo a campo. Los None no se tocan."""
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.plagas_corregir_registro(
                %s, %s::text, %s::bigint, %s::integer, %s::integer,
                %s::integer, %s::integer, %s::integer, %s::integer,
                %s::double precision, %s::double precision, %s::double precision,
                %s::double precision, %s::double precision, %s::varchar) AS n
        """, (id_registro, usuario,
              campos.get("cat_lote_id"), campos.get("linea"), campos.get("palma"),
              campos.get("insectoid"), campos.get("estadoinsectoid"),
              campos.get("cantidad"), campos.get("nivfoliar"),
              campos.get("defol5"), campos.get("defol13"), campos.get("defol21"),
              campos.get("defol29"), campos.get("defol37"),
              campos.get("observaciones")))
        return (cur.fetchone() or {}).get("n", 0)


def anular(ids: list[int], usuario: str, motivo: str | None = None) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.plagas_anular(%s, %s::text, %s::varchar) AS n",
                    (ids, usuario, motivo))
        return (cur.fetchone() or {}).get("n", 0)


def reactivar(ids: list[int], usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.plagas_reactivar(%s, %s::text) AS n",
                    (ids, usuario))
        return (cur.fetchone() or {}).get("n", 0)


# ============================================================
#  CONSOLIDADO
# ============================================================

def consolidado(fecha_desde, fecha_hasta,
                actualiza_desde=None, actualiza_hasta=None) -> list[dict]:
    """
    El consolidado para exportar, por fecha del evento o por fecha de
    actualización. La vista trae los nombres tal como van en el Excel;
    aquí se renombran a minúsculas para el resto del código.
    """
    return db.fetch_all("""
        SELECT c."LECTURA"        AS lectura,
               c."FECHA"          AS fecha,
               c."HORA"           AS hora,
               c."LOTE"           AS lote,
               c."LINEA"          AS linea,
               c."PALMA"          AS palma,
               c."INSECTO"        AS insecto,
               c."ESTADO"         AS estado,
               c."CANTIDAD"       AS cantidad,
               c."NIVEL FOLIAR"   AS nivfoliar,
               c."HOJA 5"         AS defol5,
               c."HOJA 13"        AS defol13,
               c."HOJA 21"        AS defol21,
               c."HOJA 29"        AS defol29,
               c."HOJA 37"        AS defol37,
               c."EVALUADOR"      AS evaluador,
               c."OBSERVACIONES"  AS observaciones,
               c."GEOM"           AS geom
        FROM plantacion.v_plagas_consolidado c
        WHERE (%s::date IS NULL OR c.fecha_filtro >= %s::date)
          AND (%s::date IS NULL OR c.fecha_filtro <= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro >= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro <= %s::date)
        ORDER BY c.fecha_filtro, c."LOTE", c."LINEA", c."PALMA", c."HORA"
    """, (fecha_desde, fecha_desde, fecha_hasta, fecha_hasta,
          actualiza_desde, actualiza_desde, actualiza_hasta, actualiza_hasta))
