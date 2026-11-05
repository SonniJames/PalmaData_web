"""
PalmaData · Supervisión · Cosecha lote · Repositorio
====================================================
Consulta, descarga y corrección de un registro a la vez (lote, línea,
palma, ciclo y trabajadores). No hay anulación.

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
               v.racimomalacomo, v.pendunculolargo, v.porcentajebasura,
               v.platos_enmalezados, v.malezas_estipe, v.lote_inundado,
               v.poda_atrasada,
               v.cat_lote_id, v.corregido_por, v.corregido_at,
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


# ============================================================
#  CORRECCIÓN DE UN REGISTRO
# ============================================================

ROLES_EDITABLES = ("cortador", "recolector", "alistador")


def registro(id_registro: int) -> dict | None:
    """
    Un registro con sus trabajadores desarmados por rol, en el orden en que
    están guardados: [{codigo, nombre}, ...]. Es lo que llena la ventana de
    corrección. Un código sin nombre en aux_trabajador sale con nombre NULL
    para que se vea y se pueda quitar.
    """
    fila = db.fetch_one("""
        SELECT v.id, v.fecha, v.hora, v.supervisor, v.lote, v.cat_lote_id,
               v.linea, v.palma, v.ciclo,
               v.cortador_ids, v.recolector_ids, v.alistador_ids,
               v.corregido_por, v.corregido_at
        FROM plantacion.v_super_cosecha_lote v
        WHERE v.id = %s
    """, (id_registro,))
    if not fila:
        return None
    for rol in ROLES_EDITABLES:
        fila[rol] = db.fetch_all("""
            SELECT x.cod::integer AS codigo, t.nombre
            FROM unnest(string_to_array(%s, ',')) WITH ORDINALITY AS x(cod, orden)
            LEFT JOIN plantacion.aux_trabajador t
                   ON t.aux_trabajador_id = x.cod::integer
            WHERE x.cod <> '' AND x.cod <> '0'
            ORDER BY x.orden
        """, (fila.pop(f"{rol}_ids") or "",))
    return fila


def buscar_trabajadores(busqueda: str, limite: int = 30) -> list[dict]:
    """
    Para agregar trabajadores: por nombre o por código. Primero los activos;
    los inactivos también salen (marcados) porque un registro viejo puede
    ser de alguien que ya se retiró.
    """
    texto = busqueda.strip()
    # Sin tildes a los dos lados: escribir «gomez» encuentra a «Gómez».
    return db.fetch_all("""
        SELECT aux_trabajador_id AS codigo, nombre,
               (COALESCE(estado, 1) <> 0) AS activo
        FROM plantacion.aux_trabajador
        WHERE translate(lower(nombre), 'áéíóúüñ', 'aeiouun')
              LIKE '%%' || translate(lower(%s), 'áéíóúüñ', 'aeiouun') || '%%'
           OR (%s::text ~ '^[0-9]+$' AND aux_trabajador_id::text = %s::text)
        ORDER BY (COALESCE(estado, 1) <> 0) DESC, nombre
        LIMIT %s
    """, (texto, texto, texto, limite))


def buscar_lotes(busqueda: str | None = None, limite: int = 40) -> list[dict]:
    """
    El mismo buscador de lotes del censo: escribir «138» encuentra «L138-C».
    """
    sql = "SELECT cat_lote_id, nombre, numero FROM plantacion.v_censo_lotes WHERE 1=1"
    params: list = []
    if busqueda and busqueda.strip():
        texto = busqueda.strip()
        sql += " AND (nombre ILIKE %s"
        params.append(f"%{texto}%")
        if texto.isdigit():
            sql += " OR numero = %s"
            params.append(int(texto))
        sql += ")"
    sql += " ORDER BY numero NULLS LAST, nombre LIMIT %s"
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def corregir(id_registro: int, usuario: str, campos: dict) -> int:
    """
    Corrige un registro. None = no tocar. Para los trabajadores, una lista
    vacía deja el rol sin nadie; None no lo toca.
    """
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.super_cosecha_corregir_registro(
                %s, %s::text, %s::bigint, %s::integer, %s::integer, %s::integer,
                %s::integer[], %s::integer[], %s::integer[]) AS n
        """, (id_registro, usuario,
              campos.get("cat_lote_id"), campos.get("linea"),
              campos.get("palma"), campos.get("ciclo"),
              campos.get("cortador"), campos.get("recolector"),
              campos.get("alistador")))
        return (cur.fetchone() or {}).get("n", 0)
