"""
PalmaData · Supervisión · Polinización · Repositorio
====================================================
Solo consulta y descarga.

El cruce contra lo que registró la trabajadora lo hace la vista
v_super_poli, en tres niveles (orden / palma / sin comparar). Aquí solo
se filtra y se lee: la lógica delicada vive en la base, en un solo sitio.
"""
from ...core import db

_ORDEN = ["fecha_desde", "fecha_hasta", "actualiza_desde", "actualiza_hasta",
          "cat_lote_id", "supervisor", "polinizador", "cumple",
          "hoja", "espata_sin", "cobertura", "espata_abierta", "espata_parcial"]

# Los cinco indicadores son casillas: marcadas dejan solo los registros
# donde hubo al menos uno; sin marcar no filtran nada.
_FILTROS = """
    WHERE (%s::date IS NULL OR v.fecha >= %s::date)
      AND (%s::date IS NULL OR v.fecha <= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion >= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion <= %s::date)
      AND (%s::bigint IS NULL OR v.cat_lote_id = %s::bigint)
      AND (%s::integer IS NULL OR v.supervisor_id = %s::integer)
      AND (%s::integer IS NULL OR v.polinizador_id = %s::integer)
      AND (%s::text IS NULL OR v.cumple = %s::text)
      AND (NOT %s::boolean OR v.tiene_hoja_sin_marcar = %s::boolean)
      AND (NOT %s::boolean OR v.tiene_espata_sin_abrir = %s::boolean)
      AND (NOT %s::boolean OR v.tiene_mala_cobertura = %s::boolean)
      AND (NOT %s::boolean OR v.tiene_espata_abierta = %s::boolean)
      AND (NOT %s::boolean OR v.tiene_espata_parcial = %s::boolean)
"""


def _params(f: dict) -> list:
    salida: list = []
    for clave in _ORDEN:
        valor = f.get(clave)
        if clave in ("hoja", "espata_sin", "cobertura",
                     "espata_abierta", "espata_parcial"):
            valor = bool(valor)
        salida.extend([valor, valor])
    return salida


# ============================================================
#  CATÁLOGOS
# ============================================================

def personas(rol: str) -> list[dict]:
    return db.fetch_all("""
        SELECT codigo, nombre, registros
        FROM plantacion.v_super_poli_personas
        WHERE rol = %s
        ORDER BY nombre NULLS LAST
    """, (rol,))


def lotes() -> list[dict]:
    return db.fetch_all("""
        SELECT cat_lote_id, nombre, registros
        FROM plantacion.v_super_poli_lotes
        ORDER BY nombre NULLS LAST
    """)


def fechas_disponibles(limite: int = 120) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha_super AS fecha, COUNT(*) AS registros
        FROM plantacion.pro_ordenes_super_poli_detalle
        WHERE fecha_super IS NOT NULL
        GROUP BY fecha_super ORDER BY fecha_super DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    return db.fetch_all("""
        SELECT actualizacion::date AS fecha, COUNT(*) AS registros
        FROM plantacion.pro_ordenes_super_poli_detalle
        WHERE actualizacion IS NOT NULL
        GROUP BY 1 ORDER BY 1 DESC LIMIT %s
    """, (limite,))


# ============================================================
#  CONSULTA
# ============================================================

def listar(filtros: dict, limite: int = 5000) -> list[dict]:
    sql = """
        SELECT v.id, v.id_unico, v.fecha, v.linea, v.palma, v.lote,
               v.polinizador, v.supervisor,
               v.reportada_ap1, v.reportada_ap2, v.reportada_ap3,
               v.encontrada_ap1, v.encontrada_ap2, v.encontrada_ap3,
               v.diferencia_ap1, v.diferencia_ap2, v.diferencia_ap3,
               v.cumple, v.origen_comparacion, v.motivo_sin_comparar,
               v.hoja_sin_marcar, v.espata_sin_abrir, v.mala_cobertura_aplicacion,
               v.espata_abierta, v.espata_parcial,
               v.observaciones, v.fecha_actualizacion
        FROM plantacion.v_super_poli v
    """ + _FILTROS + " ORDER BY v.fecha DESC, v.lote, v.linea, v.palma LIMIT %s"
    params = _params(filtros)
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def resumen(filtros: dict) -> dict:
    fila = db.fetch_one("""
        SELECT * FROM plantacion.super_poli_resumen(
            %s::date, %s::date, %s::date, %s::date,
            %s::bigint, %s::integer, %s::integer, %s::text,
            %s::boolean, %s::boolean, %s::boolean, %s::boolean, %s::boolean)
    """, tuple(bool(filtros.get(k)) if k in ("hoja", "espata_sin", "cobertura",
                                             "espata_abierta", "espata_parcial")
               else filtros.get(k) for k in _ORDEN))
    return dict(fila) if fila else {}
