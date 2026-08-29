"""
PalmaData · Producción · Polinización · Repositorio
===================================================
Réplica del patrón de sanidad sobre plantacion.propolinizacion, con lo
propio de este apartado:

  · El INFORME (pantalla de revisión) es agrupado por polinizador + fecha
    y lo arma la función plantacion.poli_informe(), con los filtros
    dentro: el de actualización debe aplicarse antes de agrupar.
  · El DETALLE (pantalla de descargas) es registro a registro, con
    erróneos, anulados y corrección, igual que censo y tratamientos.
  · Sin duplicados: aquí no aplica ese análisis.

Las correcciones se delegan a las funciones de la base (poli_corregir_*,
poli_anular, poli_reactivar), que validan y dejan constancia en
corregido_por / corregido_at.
"""
from ...core import db


# ============================================================
#  CATÁLOGOS
# ============================================================

def listar_evaluadores() -> list[dict]:
    return db.fetch_all("""
        SELECT evaluador_codigo, nombre, lecturas, desde, hasta
        FROM plantacion.v_poli_evaluadores
        ORDER BY nombre NULLS LAST
    """)


def listar_lotes(busqueda: str | None = None, limite: int = 500) -> list[dict]:
    """
    Lotes para el buscador del modal. Directo de cat_lote: este módulo no
    depende de las vistas de sanidad.
    """
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
    """Días con registros de polinización, para las tarjetas de descarga."""
    return db.fetch_all("""
        SELECT fecha, COUNT(*) AS registros
        FROM plantacion.v_poli_detalle
        WHERE NOT anulado
        GROUP BY fecha ORDER BY fecha DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    """Días de descarga del celular, para el filtro por actualización."""
    return db.fetch_all("""
        SELECT fecha_actualizacion AS fecha, COUNT(*) AS registros
        FROM plantacion.v_poli_detalle
        GROUP BY fecha_actualizacion
        ORDER BY fecha_actualizacion DESC LIMIT %s
    """, (limite,))


# ============================================================
#  INFORME · la tabla agrupada de la pantalla de revisión
# ============================================================

def informe(filtros: dict) -> list[dict]:
    """
    Una fila por polinizador + fecha, con los lotes del día concatenados.
    La agrupación vive en la función de la base: una sola fuente de
    verdad, con los filtros aplicados a los registros antes de agrupar.
    """
    return db.fetch_all("""
        SELECT * FROM plantacion.poli_informe(
            %s::date, %s::date, %s::date, %s::date, %s::integer)
    """, (filtros.get("fecha_desde"), filtros.get("fecha_hasta"),
          filtros.get("actualiza_desde"), filtros.get("actualiza_hasta"),
          filtros.get("evaluador")))


def resumen(filtros: dict) -> dict:
    fila = db.fetch_one("""
        SELECT * FROM plantacion.poli_resumen(
            %s::date, %s::date, %s::date, %s::date, %s::integer)
    """, (filtros.get("fecha_desde"), filtros.get("fecha_hasta"),
          filtros.get("actualiza_desde"), filtros.get("actualiza_hasta"),
          filtros.get("evaluador")))
    return dict(fila) if fila else {}


# ============================================================
#  DETALLE · la tabla de trabajo de la pantalla de descargas
# ============================================================

_FILTROS = """
    WHERE (%s::date IS NULL OR v.fecha >= %s::date)
      AND (%s::date IS NULL OR v.fecha <= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion >= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion <= %s::date)
      AND (%s::integer IS NULL OR v.evaluador_codigo = %s::integer)
"""


def _params(f: dict) -> list:
    """Cada filtro va dos veces: para el IS NULL y para la comparación."""
    orden = ["fecha_desde", "fecha_hasta", "actualiza_desde",
             "actualiza_hasta", "evaluador"]
    salida: list = []
    for clave in orden:
        salida.extend([f.get(clave), f.get(clave)])
    return salida


def detalle(filtros: dict, ver_anulados: bool = False,
            solo_erroneos: bool = False, limite: int = 1000) -> list[dict]:
    """
    Registros de la tabla de trabajo.

    `ver_anulados` muestra SOLO los anulados, no los suma a la lista.
    `solo_erroneos` deja solo las palmas que no existen en el catálogo.
    Sin filtro de fecha la vista recorrería toda la tabla, así que el
    router exige al menos uno.
    """
    sql = """
        SELECT v.propolinizacionid, v.id_unico, v.fecha, v.hora,
               v.lote, v.linea, v.palma, v.catpalmaid,
               v.trabajador, v.aplicacion1, v.aplicacion2, v.aplicacion3,
               v.inflorescencias, v.observaciones,
               v.erroneo, v.anulado, v.fecha_actualizacion,
               v.corregido_por, v.corregido_at,
               v.anulado_por, v.anulado_motivo,
               v.cat_lote_id, v.evaluador_codigo
        FROM plantacion.v_poli_detalle v
    """ + _FILTROS
    params = _params(filtros)

    sql += " AND v.anulado" if ver_anulados else " AND NOT v.anulado"
    if solo_erroneos:
        sql += " AND v.erroneo"

    sql += " ORDER BY v.fecha DESC, v.hora, v.lote, v.linea, v.palma LIMIT %s"
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


# ============================================================
#  CORRECCIONES · se delegan a las funciones de la base
# ============================================================

def corregir_lote(ids: list[int], cat_lote_id: int, usuario: str) -> int:
    """Un solo lote para varios registros. El trigger v2 recalcula
    catpalmaid, el nombre del lote y erroneo."""
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.poli_corregir_lote(%s, %s, %s::text) AS n",
                    (ids, cat_lote_id, usuario))
        return (cur.fetchone() or {}).get("n", 0)


def corregir_registro(id_registro: int, usuario: str, campos: dict) -> int:
    """Corrige un registro campo a campo. Los None no se tocan."""
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.poli_corregir_registro(
                %s, %s::text, %s::bigint, %s::integer, %s::integer,
                %s::integer, %s::integer, %s::integer, %s::varchar) AS n
        """, (id_registro, usuario,
              campos.get("cat_lote_id"), campos.get("linea"),
              campos.get("palma"), campos.get("aplicacion1"),
              campos.get("aplicacion2"), campos.get("aplicacion3"),
              campos.get("observaciones")))
        return (cur.fetchone() or {}).get("n", 0)


def anular(ids: list[int], usuario: str, motivo: str | None = None) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.poli_anular(%s, %s::text, %s::varchar) AS n",
                    (ids, usuario, motivo))
        return (cur.fetchone() or {}).get("n", 0)


def reactivar(ids: list[int], usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.poli_reactivar(%s, %s::text) AS n",
                    (ids, usuario))
        return (cur.fetchone() or {}).get("n", 0)


# ============================================================
#  CONSOLIDADO · lo que se descarga
# ============================================================

def consolidado(fecha_desde, fecha_hasta,
                actualiza_desde=None, actualiza_hasta=None) -> list[dict]:
    """
    El consolidado para exportar, filtrable por cualquiera de las dos
    fechas: la del evento o la de actualización (cuándo se descargó del
    celular). La vista trae los nombres tal como van en el Excel; aquí se
    renombran a minúsculas para el resto del código.
    """
    return db.fetch_all("""
        SELECT c."FECHA"         AS fecha,
               c."HORA"          AS hora,
               c."LOTE"          AS lote,
               c."LINEA"         AS linea,
               c."PALMA"         AS palma,
               c."POLINIZADOR"   AS polinizador,
               c."APLICACION 1"  AS aplicacion1,
               c."APLICACION 2"  AS aplicacion2,
               c."APLICACION 3"  AS aplicacion3
        FROM plantacion.v_poli_consolidado c
        WHERE (%s::date IS NULL OR c.fecha_filtro >= %s::date)
          AND (%s::date IS NULL OR c.fecha_filtro <= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro >= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro <= %s::date)
        ORDER BY c.fecha_filtro, c."POLINIZADOR", c."LOTE", c."LINEA", c."PALMA"
    """, (fecha_desde, fecha_desde, fecha_hasta, fecha_hasta,
          actualiza_desde, actualiza_desde, actualiza_hasta, actualiza_hasta))
