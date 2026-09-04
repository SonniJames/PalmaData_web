"""
PalmaData · Supervisión · Cosecha lote · Repositorio
====================================================
Solo consulta y descarga: no hay corrección ni anulación.

cortador, recolector y alistador guardan VARIOS códigos separados por
coma. El filtro compara contra cada elemento por separado
(`= ANY(string_to_array(...))`), nunca con LIKE: buscar al 125 con
LIKE '%125%' traería también al 1125, al 1250 y al 3125.
"""
from ...core import db

# El orden importa: es el mismo en _FILTROS y en _params.
_ORDEN = ["fecha_desde", "fecha_hasta", "actualiza_desde", "actualiza_hasta",
          "cat_lote_id", "supervisor", "cortador", "recolector", "alistador"]

_FILTROS = """
    WHERE (%s::date IS NULL OR v.fecha >= %s::date)
      AND (%s::date IS NULL OR v.fecha <= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion >= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion <= %s::date)
      AND (%s::bigint IS NULL OR v.cat_lote_id = %s::bigint)
      AND (%s::integer IS NULL OR v.supervisor_id = %s::integer)
      AND (%s::integer IS NULL OR %s::text = ANY(string_to_array(v.cortador_ids, ',')))
      AND (%s::integer IS NULL OR %s::text = ANY(string_to_array(v.recolector_ids, ',')))
      AND (%s::integer IS NULL OR %s::text = ANY(string_to_array(v.alistador_ids, ',')))
"""


def _params(f: dict) -> list:
    """Cada filtro va dos veces: para el IS NULL y para la comparación."""
    salida: list = []
    for clave in _ORDEN:
        salida.extend([f.get(clave), f.get(clave)])
    return salida


# ============================================================
#  CATÁLOGOS
# ============================================================

def personas(rol: str) -> list[dict]:
    """
    Trabajadores que aparecen en esta tabla con ese rol. Incluye a los que
    solo salen acompañados: la vista desarma las listas.
    """
    return db.fetch_all("""
        SELECT codigo, nombre, registros
        FROM plantacion.v_super_cosecha_personas
        WHERE rol = %s
        ORDER BY nombre NULLS LAST
    """, (rol,))


def lotes() -> list[dict]:
    return db.fetch_all("""
        SELECT cat_lote_id, nombre, registros
        FROM plantacion.v_super_cosecha_lotes
        ORDER BY nombre NULLS LAST
    """)


def fechas_disponibles(limite: int = 120) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha, COUNT(*) AS registros
        FROM plantacion.supercosechalote
        WHERE fecha IS NOT NULL
        GROUP BY fecha ORDER BY fecha DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    return db.fetch_all("""
        SELECT actualizacion::date AS fecha, COUNT(*) AS registros
        FROM plantacion.supercosechalote
        WHERE actualizacion IS NOT NULL
        GROUP BY 1 ORDER BY 1 DESC LIMIT %s
    """, (limite,))


# ============================================================
#  CONSULTA
# ============================================================

def listar(filtros: dict, limite: int = 5000) -> list[dict]:
    sql = """
        SELECT v.id, v.id_unico, v.fecha, v.hora,
               v.supervisor, v.cortador, v.recolector, v.alistador,
               v.linea, v.palma, v.lote, v.ciclo,
               v.racimos_sin_recoger, v.racimos_sin_cortar, v.racimo_robado,
               v.hojas_mal_acomodadas, v.hoja_colgando, v.fruto_plato,
               v.observaciones,
               v.racimos_recogidos, v.racimos_verdes,
               v.racimos_sobremaduros, v.racimos_podridos,
               v.fecha_actualizacion
        FROM plantacion.v_super_cosecha_lote v
    """ + _FILTROS + " ORDER BY v.fecha DESC, v.hora, v.lote, v.linea, v.palma LIMIT %s"
    params = _params(filtros)
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def resumen(filtros: dict) -> dict:
    fila = db.fetch_one("""
        SELECT * FROM plantacion.super_cosecha_resumen(
            %s::date, %s::date, %s::date, %s::date,
            %s::bigint, %s::integer, %s::integer, %s::integer, %s::integer)
    """, tuple(filtros.get(k) for k in _ORDEN))
    return dict(fila) if fila else {}
