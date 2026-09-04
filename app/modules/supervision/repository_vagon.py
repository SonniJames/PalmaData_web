"""
PalmaData · Supervisión · Cosecha vagón · Repositorio
=====================================================
Solo consulta y descarga.

`trabajador` guarda varios códigos separados por coma. El filtro compara
contra cada elemento por separado (`= ANY(string_to_array(...))`), nunca
con LIKE: buscar al 125 con LIKE traería también al 1125.
"""
from ...core import db

_ORDEN = ["fecha_desde", "fecha_hasta", "actualiza_desde", "actualiza_hasta",
          "cat_lote_id", "supervisor", "trabajador"]

_FILTROS = """
    WHERE (%s::date IS NULL OR v.fecha >= %s::date)
      AND (%s::date IS NULL OR v.fecha <= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion >= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion <= %s::date)
      AND (%s::bigint IS NULL OR v.cat_lote_id = %s::bigint)
      AND (%s::integer IS NULL OR v.supervisor_id = %s::integer)
      AND (%s::integer IS NULL OR %s::text = ANY(string_to_array(v.trabajador_ids, ',')))
"""


def _params(f: dict) -> list:
    salida: list = []
    for clave in _ORDEN:
        salida.extend([f.get(clave), f.get(clave)])
    return salida


# ============================================================
#  CATÁLOGOS
# ============================================================

def personas(rol: str) -> list[dict]:
    return db.fetch_all("""
        SELECT codigo, nombre, registros
        FROM plantacion.v_super_vagon_personas
        WHERE rol = %s
        ORDER BY nombre NULLS LAST
    """, (rol,))


def lotes() -> list[dict]:
    return db.fetch_all("""
        SELECT cat_lote_id, nombre, registros
        FROM plantacion.v_super_vagon_lotes
        ORDER BY nombre NULLS LAST
    """)


def fechas_disponibles(limite: int = 120) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha, COUNT(*) AS registros
        FROM plantacion.supercosechavagon
        WHERE fecha IS NOT NULL
        GROUP BY fecha ORDER BY fecha DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    return db.fetch_all("""
        SELECT actualizacion::date AS fecha, COUNT(*) AS registros
        FROM plantacion.supercosechavagon
        WHERE actualizacion IS NOT NULL
        GROUP BY 1 ORDER BY 1 DESC LIMIT %s
    """, (limite,))


# ============================================================
#  CONSULTA
# ============================================================

def listar(filtros: dict, limite: int = 5000) -> list[dict]:
    sql = """
        SELECT v.id, v.id_unico, v.fecha, v.hora, v.supervisor, v.lote,
               v.racimos_verdes, v.racimos_sobremaduros, v.racimos_podridos,
               v.pedunculo_largo, v.racimos_muestra, v.racimos_malformados,
               v.racimos_enfermos, v.racimos_eupalamides,
               v.observaciones, v.trabajador, v.fecha_actualizacion
        FROM plantacion.v_super_cosecha_vagon v
    """ + _FILTROS + " ORDER BY v.fecha DESC, v.hora, v.lote LIMIT %s"
    params = _params(filtros)
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def resumen(filtros: dict) -> dict:
    fila = db.fetch_one("""
        SELECT * FROM plantacion.super_vagon_resumen(
            %s::date, %s::date, %s::date, %s::date,
            %s::bigint, %s::integer, %s::integer)
    """, tuple(filtros.get(k) for k in _ORDEN))
    return dict(fila) if fila else {}
