"""
PalmaData · Sanidad · Tratamientos · Repositorio
================================================
Réplica del repositorio del censo sobre san_enf_tratamiento.
Sin nada de `erroneo`: en tratamientos no existe esa validación.

Las correcciones se delegan a las funciones de la base
(trat_corregir_lote, trat_corregir_registro, trat_anular,
trat_reactivar), que validan y dejan constancia de quién cambió
qué y cuándo en corregido_por y corregido_at.
"""
from ...core import db


# ============================================================
#  CATÁLOGOS · para los desplegables de la ventana de edición
# ============================================================

def listar_tratamientos() -> list[dict]:
    return db.fetch_all("""
        SELECT san_evento_trat_id, codigo, descripcion
        FROM plantacion.v_cat_tratamientos
    """)


def listar_evaluadores() -> list[dict]:
    return db.fetch_all("""
        SELECT evaluador_codigo, nombre, lecturas, desde, hasta
        FROM plantacion.v_trat_evaluadores
        ORDER BY nombre NULLS LAST
    """)


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

_COLUMNAS = """
    v.san_enf_tratamiento_id, v.id_unico, v.fecha, v.hora,
    v.lote, v.linea, v.palma, v.cat_palma_id,
    v.enfermedad, v.evento, v.tratamiento, v.descripcion,
    v.cantidad, v.trabajador, v.observaciones,
    v.anulado, v.fecha_actualizacion,
    v.corregido_por, v.corregido_at,
    v.anulado_por, v.anulado_motivo,
    v.cat_lote_id, v.san_enfermedades_id, v.san_evento_enf_id,
    v.san_evento_trat_id, v.evaluador_codigo
"""


def _params(f: dict) -> list:
    """Cada filtro va dos veces: para el IS NULL y para la comparación."""
    orden = ["fecha_desde", "fecha_hasta", "actualiza_desde",
             "actualiza_hasta", "cat_lote_id", "evaluador"]
    salida: list = []
    for clave in orden:
        salida.extend([f.get(clave), f.get(clave)])
    return salida


def listar_revision(filtros: dict, ver_anulados: bool = False,
                    limite: int = 1000) -> list[dict]:
    """
    Registros de la pantalla de revisión.

    `ver_anulados` muestra SOLO los anulados, no los suma a la lista
    normal. Sin filtro de fecha la vista recorrería toda la tabla, así
    que el router exige al menos uno.
    """
    sql = f"SELECT {_COLUMNAS} FROM plantacion.v_trat_revision v" + _FILTROS
    params = _params(filtros)

    sql += " AND v.anulado" if ver_anulados else " AND NOT v.anulado"

    sql += " ORDER BY v.fecha DESC, v.hora, v.lote, v.linea, v.palma LIMIT %s"
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def resumen(filtros: dict) -> dict:
    fila = db.fetch_one("""
        SELECT * FROM plantacion.trat_resumen(
            %s::date, %s::date, %s::date, %s::date, %s::bigint, %s::integer)
    """, (filtros.get("fecha_desde"), filtros.get("fecha_hasta"),
          filtros.get("actualiza_desde"), filtros.get("actualiza_hasta"),
          filtros.get("cat_lote_id"), filtros.get("evaluador")))
    return dict(fila) if fila else {}


def distribucion(campo: str, filtros: dict, limite: int = 20) -> list[dict]:
    return db.fetch_all("""
        SELECT * FROM plantacion.trat_distribucion(
            %s, %s::date, %s::date, %s::date, %s::date,
            %s::bigint, %s::integer, %s)
    """, (campo, filtros.get("fecha_desde"), filtros.get("fecha_hasta"),
          filtros.get("actualiza_desde"), filtros.get("actualiza_hasta"),
          filtros.get("cat_lote_id"), filtros.get("evaluador"), limite))


def duplicados(filtros: dict, limite: int = 1000) -> list[dict]:
    """
    Mismo día, misma línea, misma palma: casi siempre un doble registro.

    El filtro va DENTRO del subquery, no sobre la vista. Si se aplicara
    encima, la ventana ya habría contado las repeticiones sobre toda la
    tabla y saldrían registros que en el período filtrado son únicos.
    """
    sql = f"""
        SELECT * FROM (
            SELECT {_COLUMNAS},
                   COUNT(*) OVER (PARTITION BY v.fecha, v.linea, v.palma)
                       AS repeticiones
            FROM plantacion.v_trat_revision v
    """ + _FILTROS + """
              AND NOT v.anulado
        ) d
        WHERE d.repeticiones > 1
        ORDER BY d.fecha DESC, d.linea, d.palma, d.hora
        LIMIT %s
    """
    params = _params(filtros)
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


# ============================================================
#  CORRECCIONES · se delegan a las funciones de la base
# ============================================================

def corregir_lote(ids: list[int], cat_lote_id: int, usuario: str) -> int:
    """Un solo lote para varios registros. Es la corrección más común."""
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.trat_corregir_lote(%s, %s, %s::text) AS n",
                    (ids, cat_lote_id, usuario))
        return (cur.fetchone() or {}).get("n", 0)


def corregir_registro(id_registro: int, usuario: str, campos: dict) -> int:
    """
    Corrige un registro campo a campo. Los que van en None no se tocan:
    así se puede cambiar solo la cantidad sin pisar lo demás.
    """
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.trat_corregir_registro(
                %s, %s::text, %s::bigint, %s::integer, %s::integer,
                %s::integer, %s::integer, %s::integer,
                %s::double precision, %s::varchar) AS n
        """, (id_registro, usuario,
              campos.get("cat_lote_id"), campos.get("linea"),
              campos.get("palma"), campos.get("san_enfermedades_id"),
              campos.get("san_evento_enf_id"), campos.get("san_evento_trat_id"),
              campos.get("cantidad"), campos.get("observaciones")))
        return (cur.fetchone() or {}).get("n", 0)


def anular(ids: list[int], usuario: str, motivo: str | None = None) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.trat_anular(%s, %s::text, %s::varchar) AS n",
                    (ids, usuario, motivo))
        return (cur.fetchone() or {}).get("n", 0)


def reactivar(ids: list[int], usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.trat_reactivar(%s, %s::text) AS n",
                    (ids, usuario))
        return (cur.fetchone() or {}).get("n", 0)


# ============================================================
#  CONSOLIDADO · lo que se descarga
# ============================================================

def consolidado(fecha_desde, fecha_hasta,
                actualiza_desde=None, actualiza_hasta=None) -> list[dict]:
    """
    El consolidado para exportar. A diferencia del censo, aquí la
    descarga filtra por CUALQUIERA de las dos fechas: la del
    tratamiento (cuándo se aplicó) o la de actualización (cuándo se
    descargó del celular). Así se pidió para este apartado.

    La vista devuelve los nombres tal como van en el Excel
    ("REGISTRO ID", "FECHA"…). Aquí se renombran a minúsculas para
    que el resto del código no tenga que citarlos.
    """
    return db.fetch_all("""
        SELECT c."REGISTRO ID"    AS registro_id,
               c."FECHA"          AS fecha,
               c."HORA"           AS hora,
               c."LOTE"           AS lote,
               c."LINEA"          AS linea,
               c."PALMA"          AS palma,
               c."PALMA ID"       AS palma_id,
               c."ENFERMEDAD"     AS enfermedad,
               c."EVENTO"         AS evento,
               c."TRATAMIENTO"    AS tratamiento,
               c."DESCRIPCION"    AS descripcion,
               c."CANTIDAD"       AS cantidad,
               c."EVALUADOR"      AS evaluador,
               c."OBSERVACIONES"  AS observaciones
        FROM plantacion.v_trat_consolidado c
        WHERE (%s::date IS NULL OR c.fecha_filtro >= %s::date)
          AND (%s::date IS NULL OR c.fecha_filtro <= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro >= %s::date)
          AND (%s::date IS NULL OR c.actualiza_filtro <= %s::date)
        ORDER BY c.fecha_filtro, c."LOTE", c."LINEA", c."PALMA"
    """, (fecha_desde, fecha_desde, fecha_hasta, fecha_hasta,
          actualiza_desde, actualiza_desde, actualiza_hasta, actualiza_hasta))


def fechas_disponibles(limite: int = 90) -> list[dict]:
    """Días con tratamientos, para el desplegable de la descarga."""
    return db.fetch_all("""
        SELECT fecha, COUNT(*) AS registros
        FROM plantacion.v_trat_revision
        WHERE NOT anulado
        GROUP BY fecha ORDER BY fecha DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    """Días de descarga, para el filtro por fecha de actualización."""
    return db.fetch_all("""
        SELECT fecha_actualizacion AS fecha, COUNT(*) AS registros
        FROM plantacion.v_trat_revision
        GROUP BY fecha_actualizacion
        ORDER BY fecha_actualizacion DESC LIMIT %s
    """, (limite,))
