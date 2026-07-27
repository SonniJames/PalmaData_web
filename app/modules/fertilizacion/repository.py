"""
PalmaData · Fertilización · Repositorio
=======================================
Todo el SQL del módulo. El router no escribe consultas.

Los INSERT se construyen a partir del mapa de columnas.py, así que
si el formato del Excel cambia, no hay que tocar SQL a mano.
"""
import json

from ...core import db
from . import columnas as COL
from .params import get_default_params, merge_params

# Alias de bloque -> nombre corto que usa el frontend
ALIAS = {
    "fert_foliar":        "foliar",
    "fert_secundarios":   "secundarios",
    "fert_indice":        "indice",
    "fert_diferencia":    "diferencia",
    "fert_requerimiento": "requerimiento",
    "fert_oxido":         "oxido",
    "fert_simples":       "simples",
    "fert_grado":         "grado",
    "fert_toneladas":     "toneladas",
}


# ============================================================
#  CAMPAÑAS
# ============================================================

def listar_campanas() -> list[dict]:
    return db.fetch_all("""
        SELECT c.id, c.anio, c.nombre, c.estado, c.archivo,
               c.cargado_por, c.created_at,
               COUNT(l.id) AS lotes
        FROM plantacion.fert_campana c
        LEFT JOIN plantacion.fert_lote l ON l.campana_id = c.id
        GROUP BY c.id
        ORDER BY c.anio DESC
    """)


def campana_por_anio(anio: int) -> dict | None:
    return db.fetch_one(
        "SELECT id, anio, nombre, estado FROM plantacion.fert_campana WHERE anio=%s",
        (anio,))


def crear_campana(cur, anio: int, nombre=None, archivo=None,
                  usuario=None, copiar_de=None) -> int:
    cur.execute("""
        INSERT INTO plantacion.fert_campana (anio, nombre, archivo, cargado_por)
        VALUES (%s,%s,%s,%s) RETURNING id
    """, (anio, nombre or f"Fertilización {anio}", archivo, usuario))
    campana_id = cur.fetchone()["id"]

    params = None
    if copiar_de:
        cur.execute("""
            SELECT p.params FROM plantacion.fert_parametros p
            JOIN plantacion.fert_campana c ON c.id = p.campana_id
            WHERE c.anio = %s
        """, (copiar_de,))
        fila = cur.fetchone()
        if fila:
            params = fila["params"]
    if params is None:
        params = get_default_params()

    cur.execute(
        "INSERT INTO plantacion.fert_parametros (campana_id, params) VALUES (%s,%s)",
        (campana_id, json.dumps(params)))
    return campana_id


def obtener_o_crear_campana(cur, anio: int, archivo=None, usuario=None) -> int:
    cur.execute("SELECT id FROM plantacion.fert_campana WHERE anio=%s", (anio,))
    fila = cur.fetchone()
    if fila:
        if archivo:
            cur.execute("""UPDATE plantacion.fert_campana
                           SET archivo=%s, cargado_por=%s WHERE id=%s""",
                        (archivo, usuario, fila["id"]))
        return fila["id"]
    return crear_campana(cur, anio, archivo=archivo, usuario=usuario)


def eliminar_campana(anio: int) -> bool:
    with db.get_cursor() as cur:
        cur.execute("DELETE FROM plantacion.fert_campana WHERE anio=%s", (anio,))
        return cur.rowcount > 0


def cerrar_campana(anio: int, cerrada: bool) -> bool:
    with db.get_cursor() as cur:
        cur.execute("UPDATE plantacion.fert_campana SET estado=%s WHERE anio=%s",
                    (0 if cerrada else 1, anio))
        return cur.rowcount > 0


# ============================================================
#  PARÁMETROS
# ============================================================

def obtener_parametros(anio: int) -> dict | None:
    fila = db.fetch_one("""
        SELECT p.params FROM plantacion.fert_parametros p
        JOIN plantacion.fert_campana c ON c.id = p.campana_id
        WHERE c.anio = %s
    """, (anio,))
    return merge_params(get_default_params(), fila["params"] or {}) if fila else None


def parametros_o_default(anio: int) -> dict:
    return obtener_parametros(anio) or get_default_params()


def guardar_parametros(anio: int, params: dict) -> bool:
    completos = merge_params(get_default_params(), params)
    with db.get_cursor() as cur:
        cur.execute("SELECT id FROM plantacion.fert_campana WHERE anio=%s", (anio,))
        camp = cur.fetchone()
        if not camp:
            return False
        cur.execute("""
            INSERT INTO plantacion.fert_parametros (campana_id, params)
            VALUES (%s,%s)
            ON CONFLICT (campana_id) DO UPDATE SET params = EXCLUDED.params
        """, (camp["id"], json.dumps(completos)))
    return True


# ============================================================
#  CARGA DE LOTES
# ============================================================

def _sql_upsert_bloque(tabla: str) -> str:
    campos = [c for _, c in COL.BLOQUES[tabla]]
    cols = ", ".join(campos)
    marcas = ", ".join(["%s"] * len(campos))
    updates = ", ".join(f"{c}=EXCLUDED.{c}" for c in campos)
    return f"""
        INSERT INTO plantacion.{tabla} (lote_id, {cols})
        VALUES (%s, {marcas})
        ON CONFLICT (lote_id) DO UPDATE SET {updates}
    """


_SQL_BLOQUES = {t: _sql_upsert_bloque(t) for t in COL.BLOQUES if t != "fert_lote"}

_SQL_LOTE = """
    INSERT INTO plantacion.fert_lote
        (campana_id, fila_excel, codigo, zona, rango_edad, identificacion,
         uma, material, siembra, palmas, hoja, mst, tons)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT (campana_id, identificacion) DO UPDATE SET
        fila_excel = EXCLUDED.fila_excel,
        codigo     = EXCLUDED.codigo,
        zona       = EXCLUDED.zona,
        rango_edad = EXCLUDED.rango_edad,
        uma        = EXCLUDED.uma,
        material   = EXCLUDED.material,
        siembra    = EXCLUDED.siembra,
        palmas     = EXCLUDED.palmas,
        hoja       = EXCLUDED.hoja,
        mst        = EXCLUDED.mst,
        tons       = EXCLUDED.tons
    RETURNING id, (xmax = 0) AS es_nuevo
"""


def guardar_lote(cur, campana_id: int, registro: dict) -> bool:
    """Inserta o actualiza un lote y todos sus bloques. True si es nuevo."""
    base = registro["fert_lote"]
    cur.execute(_SQL_LOTE, (
        campana_id, registro.get("fila_excel"),
        base.get("codigo"), base.get("zona"), base.get("rango_edad"),
        base.get("identificacion"), base.get("uma"), base.get("material"),
        base.get("siembra"), base.get("palmas"), base.get("hoja"),
        base.get("mst"), base.get("tons"),
    ))
    fila = cur.fetchone()
    lote_id, es_nuevo = fila["id"], fila["es_nuevo"]

    for tabla, sql in _SQL_BLOQUES.items():
        datos = registro.get(tabla, {})
        valores = [lote_id] + [datos.get(c) for _, c in COL.BLOQUES[tabla]]
        cur.execute(sql, valores)

    return bool(es_nuevo)


def borrar_lotes_de_campana(cur, campana_id: int) -> int:
    cur.execute("DELETE FROM plantacion.fert_lote WHERE campana_id=%s", (campana_id,))
    return cur.rowcount


# ============================================================
#  CONSULTA
# ============================================================

def _select_completo() -> str:
    """Arma el SELECT con todos los bloques, cada uno como JSON anidado."""
    joins, campos = [], []
    for tabla, alias in ALIAS.items():
        letra = alias[:2] + str(len(joins))
        joins.append(f"LEFT JOIN plantacion.{tabla} {letra} ON {letra}.lote_id = l.id")
        pares = ", ".join(f"'{c}', {letra}.{c}" for _, c in COL.BLOQUES[tabla])
        campos.append(f"json_build_object({pares}) AS {alias}")

    return f"""
        SELECT l.id, l.fila_excel, l.codigo, l.zona, l.rango_edad,
               l.identificacion, l.uma, l.material, l.siembra,
               l.palmas, l.hoja, l.mst, l.tons,
               {", ".join(campos)}
        FROM plantacion.fert_lote l
        JOIN plantacion.fert_campana c ON c.id = l.campana_id
        {" ".join(joins)}
    """


_SELECT = _select_completo()


def listar_lotes(anio: int, zona: str | None = None,
                 rango_edad: str | None = None) -> list[dict]:
    sql = _SELECT + " WHERE c.anio = %s"
    params: list = [anio]
    if zona and zona.lower() != "todas":
        sql += " AND l.zona = %s"
        params.append(zona)
    if rango_edad and rango_edad.lower() != "todas":
        sql += " AND l.rango_edad = %s"
        params.append(rango_edad)
    sql += " ORDER BY l.uma NULLS LAST, l.identificacion"
    return db.fetch_all(sql, tuple(params))


def obtener_lote(lote_id: int) -> dict | None:
    return db.fetch_one(_SELECT + " WHERE l.id = %s", (lote_id,))


def filtros_de_campana(anio: int) -> dict:
    zonas = db.fetch_all("""
        SELECT DISTINCT l.zona FROM plantacion.fert_lote l
        JOIN plantacion.fert_campana c ON c.id = l.campana_id
        WHERE c.anio=%s AND l.zona IS NOT NULL ORDER BY l.zona
    """, (anio,))
    edades = db.fetch_all("""
        SELECT DISTINCT l.rango_edad FROM plantacion.fert_lote l
        JOIN plantacion.fert_campana c ON c.id = l.campana_id
        WHERE c.anio=%s AND l.rango_edad IS NOT NULL ORDER BY l.rango_edad
    """, (anio,))
    return {"zonas": [z["zona"] for z in zonas],
            "rangos_edad": [e["rango_edad"] for e in edades]}


def actualizar_base(lote_id: int, datos: dict) -> bool:
    """Edición manual de los datos base de un lote."""
    permitidos = ["codigo", "zona", "rango_edad", "identificacion", "uma",
                  "material", "siembra", "palmas", "hoja", "mst", "tons"]
    sets = [f"{c}=%s" for c in permitidos if c in datos]
    if not sets:
        return False
    valores = [datos[c] for c in permitidos if c in datos] + [lote_id]
    with db.get_cursor() as cur:
        cur.execute(f"UPDATE plantacion.fert_lote SET {', '.join(sets)} WHERE id=%s",
                    tuple(valores))
        return cur.rowcount > 0


def eliminar_lote(lote_id: int) -> bool:
    with db.get_cursor() as cur:
        cur.execute("DELETE FROM plantacion.fert_lote WHERE id=%s", (lote_id,))
        return cur.rowcount > 0
