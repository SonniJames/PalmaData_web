"""
PalmaData · Fertilización · Repositorio
=======================================
Todo el SQL del módulo. El router no escribe consultas.

Seis tablas:
  fert_campana · fert_lote · fert_foliar · fert_balance
  fert_requerimiento · fert_parametros
"""
import json

from ...core import db
from . import formato as F
from .params import get_default_params, merge_params

# clave interna -> tabla destino de los bloques JSONB
TABLAS_BLOQUE = {clave: tabla for clave, (_h, tabla, _e) in F.HOJAS_DATOS.items()}


# ============================================================
#  EMPRESAS
#  La campaña es "empresa + año". Como los lotes y los parámetros
#  cuelgan de la campaña, la separación por empresa se propaga sola.
# ============================================================

def listar_empresas(solo_activas: bool = True) -> list[dict]:
    sql = "SELECT id, nombre, nit, orden, activo FROM plantacion.fert_empresa"
    if solo_activas:
        sql += " WHERE activo"
    sql += " ORDER BY orden, nombre"
    return db.fetch_all(sql)


def empresa_por_id(empresa_id: int) -> dict | None:
    return db.fetch_one(
        "SELECT id, nombre FROM plantacion.fert_empresa WHERE id=%s", (empresa_id,))


def empresa_por_nombre(nombre: str) -> dict | None:
    return db.fetch_one(
        "SELECT id, nombre FROM plantacion.fert_empresa WHERE LOWER(nombre)=LOWER(%s)",
        (nombre,))


def empresa_por_defecto() -> dict | None:
    return db.fetch_one("""
        SELECT id, nombre FROM plantacion.fert_empresa
        WHERE activo ORDER BY orden, nombre LIMIT 1
    """)


# ============================================================
#  CAMPAÑAS
# ============================================================

def listar_campanas(empresa_id: int | None = None) -> list[dict]:
    sql = """
        SELECT c.id, c.anio, c.nombre, c.estado, c.archivo,
               c.cargado_por, c.created_at,
               c.empresa_id, e.nombre AS empresa,
               COUNT(l.id) AS lotes
        FROM plantacion.fert_campana c
        JOIN plantacion.fert_empresa e ON e.id = c.empresa_id
        LEFT JOIN plantacion.fert_lote l ON l.campana_id = c.id
    """
    params: tuple = ()
    if empresa_id:
        sql += " WHERE c.empresa_id = %s"
        params = (empresa_id,)
    sql += " GROUP BY c.id, e.nombre, e.orden ORDER BY e.orden, c.anio DESC"
    return db.fetch_all(sql, params)


def campana_por_anio(empresa_id: int, anio: int) -> dict | None:
    return db.fetch_one("""
        SELECT id, anio, nombre, estado, empresa_id
        FROM plantacion.fert_campana WHERE empresa_id=%s AND anio=%s
    """, (empresa_id, anio))


def crear_campana(cur, empresa_id: int, anio: int, nombre=None, archivo=None,
                  usuario=None, copiar_de=None) -> int:
    cur.execute("""
        INSERT INTO plantacion.fert_campana
            (empresa_id, anio, nombre, archivo, cargado_por)
        VALUES (%s,%s,%s,%s,%s) RETURNING id
    """, (empresa_id, anio, nombre or f"Fertilización {anio}", archivo, usuario))
    campana_id = cur.fetchone()["id"]

    # Hereda los parámetros de otra campaña DE LA MISMA EMPRESA
    params = None
    if copiar_de:
        cur.execute("""
            SELECT p.params FROM plantacion.fert_parametros p
            JOIN plantacion.fert_campana c ON c.id = p.campana_id
            WHERE c.empresa_id = %s AND c.anio = %s
        """, (empresa_id, copiar_de))
        fila = cur.fetchone()
        if fila:
            params = fila["params"]

    cur.execute(
        "INSERT INTO plantacion.fert_parametros (campana_id, params) VALUES (%s,%s)",
        (campana_id, json.dumps(params or get_default_params())))
    return campana_id


def obtener_o_crear_campana(cur, empresa_id: int, anio: int,
                            archivo=None, usuario=None) -> int:
    cur.execute("""SELECT id FROM plantacion.fert_campana
                   WHERE empresa_id=%s AND anio=%s""", (empresa_id, anio))
    fila = cur.fetchone()
    if fila:
        if archivo:
            cur.execute("""UPDATE plantacion.fert_campana
                           SET archivo=%s, cargado_por=%s WHERE id=%s""",
                        (archivo, usuario, fila["id"]))
        return fila["id"]
    # Año nuevo: hereda los parámetros de la campaña más reciente de ESA empresa
    cur.execute("""SELECT MAX(anio) AS ultimo FROM plantacion.fert_campana
                   WHERE empresa_id=%s""", (empresa_id,))
    ultimo = (cur.fetchone() or {}).get("ultimo")
    return crear_campana(cur, empresa_id, anio, archivo=archivo,
                         usuario=usuario, copiar_de=ultimo)


def eliminar_campana(empresa_id: int, anio: int) -> bool:
    with db.get_cursor() as cur:
        cur.execute("""DELETE FROM plantacion.fert_campana
                       WHERE empresa_id=%s AND anio=%s""", (empresa_id, anio))
        return cur.rowcount > 0


def cerrar_campana(empresa_id: int, anio: int, cerrada: bool) -> bool:
    with db.get_cursor() as cur:
        cur.execute("""UPDATE plantacion.fert_campana SET estado=%s
                       WHERE empresa_id=%s AND anio=%s""",
                    (0 if cerrada else 1, empresa_id, anio))
        return cur.rowcount > 0


# ============================================================
#  PARÁMETROS
# ============================================================

def obtener_parametros(empresa_id: int, anio: int) -> dict | None:
    fila = db.fetch_one("""
        SELECT p.params FROM plantacion.fert_parametros p
        JOIN plantacion.fert_campana c ON c.id = p.campana_id
        WHERE c.empresa_id = %s AND c.anio = %s
    """, (empresa_id, anio))
    return merge_params(get_default_params(), fila["params"] or {}) if fila else None


def parametros_o_default(empresa_id: int, anio: int) -> dict:
    return obtener_parametros(empresa_id, anio) or get_default_params()


def guardar_parametros(empresa_id: int, anio: int, params: dict) -> bool:
    completos = merge_params(get_default_params(), params)
    with db.get_cursor() as cur:
        cur.execute("""SELECT id FROM plantacion.fert_campana
                       WHERE empresa_id=%s AND anio=%s""", (empresa_id, anio))
        camp = cur.fetchone()
        if not camp:
            return False
        cur.execute("""
            INSERT INTO plantacion.fert_parametros (campana_id, params)
            VALUES (%s,%s)
            ON CONFLICT (campana_id) DO UPDATE SET params = EXCLUDED.params
        """, (camp["id"], json.dumps(completos)))
    return True


def guardar_parametros_cur(cur, campana_id: int, params: dict):
    cur.execute("""
        INSERT INTO plantacion.fert_parametros (campana_id, params)
        VALUES (%s,%s)
        ON CONFLICT (campana_id) DO UPDATE SET params = EXCLUDED.params
    """, (campana_id, json.dumps(params)))


# ============================================================
#  CARGA
# ============================================================

_SQL_LOTE = """
    INSERT INTO plantacion.fert_lote
        (campana_id, identificacion, uma, sector, zona, rango_edad, palmas,
         hectareas, material, siembra, codigo, hoja, mst, tons, extra, fila_excel)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT (campana_id, identificacion) DO UPDATE SET
        uma=EXCLUDED.uma, sector=EXCLUDED.sector, zona=EXCLUDED.zona,
        rango_edad=EXCLUDED.rango_edad, palmas=EXCLUDED.palmas,
        hectareas=EXCLUDED.hectareas, material=EXCLUDED.material,
        siembra=EXCLUDED.siembra, codigo=EXCLUDED.codigo, hoja=EXCLUDED.hoja,
        mst=EXCLUDED.mst, tons=EXCLUDED.tons, extra=EXCLUDED.extra,
        fila_excel=EXCLUDED.fila_excel
    RETURNING id, (xmax = 0) AS es_nuevo
"""


def guardar_lote(cur, campana_id: int, reg: dict) -> bool:
    """Guarda el lote y sus bloques. Devuelve True si es nuevo."""
    cur.execute(_SQL_LOTE, (
        campana_id, reg["identificacion"], reg.get("uma"), reg.get("sector"),
        reg.get("zona"), reg.get("rango_edad"), reg.get("palmas"),
        reg.get("hectareas"), reg.get("material"), reg.get("siembra"),
        reg.get("codigo"), reg.get("hoja"), reg.get("mst"), reg.get("tons"),
        json.dumps(reg.get("extra") or {}), reg.get("fila_excel"),
    ))
    fila = cur.fetchone()
    lote_id, es_nuevo = fila["id"], fila["es_nuevo"]

    for clave, tabla in TABLAS_BLOQUE.items():
        datos = (reg.get("bloques") or {}).get(clave)
        if datos is None:
            continue
        cur.execute(f"""
            INSERT INTO plantacion.{tabla} (lote_id, datos)
            VALUES (%s,%s)
            ON CONFLICT (lote_id) DO UPDATE SET datos = EXCLUDED.datos
        """, (lote_id, json.dumps(datos)))

    return bool(es_nuevo)


def borrar_lotes_de_campana(cur, campana_id: int) -> int:
    cur.execute("DELETE FROM plantacion.fert_lote WHERE campana_id=%s", (campana_id,))
    return cur.rowcount


# ============================================================
#  CONSULTA
# ============================================================

_SELECT = """
    SELECT l.id, l.identificacion, l.uma, l.sector, l.zona, l.rango_edad,
           l.palmas, l.hectareas, l.material, l.siembra, l.codigo, l.hoja,
           l.mst, l.tons, l.extra, l.fila_excel,
           COALESCE(f.datos, '{}'::jsonb) AS foliar,
           COALESCE(b.datos, '{}'::jsonb) AS balance,
           COALESCE(r.datos, '{}'::jsonb) AS requerimiento
    FROM plantacion.fert_lote l
    JOIN plantacion.fert_campana c ON c.id = l.campana_id
    LEFT JOIN plantacion.fert_foliar f        ON f.lote_id = l.id
    LEFT JOIN plantacion.fert_balance b       ON b.lote_id = l.id
    LEFT JOIN plantacion.fert_requerimiento r ON r.lote_id = l.id
"""


def listar_lotes(empresa_id: int, anio: int, zona=None, sector=None,
                 rango_edad=None, identificacion=None, uma=None) -> list[dict]:
    sql = _SELECT + " WHERE c.empresa_id = %s AND c.anio = %s"
    params: list = [empresa_id, anio]
    if zona and zona.lower() != "todas":
        sql += " AND l.zona = %s"
        params.append(zona)
    if sector and sector.lower() != "todos":
        sql += " AND l.sector = %s"
        params.append(sector)
    if rango_edad and rango_edad.lower() != "todas":
        sql += " AND l.rango_edad = %s"
        params.append(rango_edad)
    if identificacion and identificacion.lower() not in ("todas", "todos"):
        # Coincidencia parcial: permite buscar escribiendo parte del nombre
        sql += " AND l.identificacion ILIKE %s"
        params.append(f"%{identificacion}%")
    if uma not in (None, "", "Todas", "Todos"):
        sql += " AND l.uma = %s"
        params.append(int(uma))
    sql += " ORDER BY l.uma NULLS LAST, l.identificacion"
    return db.fetch_all(sql, tuple(params))


def obtener_lote(lote_id: int) -> dict | None:
    return db.fetch_one(_SELECT + " WHERE l.id = %s", (lote_id,))


def filtros_de_campana(empresa_id: int, anio: int) -> dict:
    base = """
        FROM plantacion.fert_lote l
        JOIN plantacion.fert_campana c ON c.id = l.campana_id
        WHERE c.empresa_id = %s AND c.anio = %s
    """
    def distintos(columna):
        filas = db.fetch_all(
            f"SELECT DISTINCT l.{columna} AS v {base} AND l.{columna} IS NOT NULL "
            f"ORDER BY v", (empresa_id, anio))
        return [f["v"] for f in filas]

    umas = db.fetch_all(
        f"SELECT DISTINCT l.uma AS v {base} AND l.uma IS NOT NULL ORDER BY v",
        (empresa_id, anio))
    idents = db.fetch_all(
        f"SELECT l.identificacion AS v {base} ORDER BY l.uma NULLS LAST, v",
        (empresa_id, anio))

    return {"zonas": distintos("zona"),
            "sectores": distintos("sector"),
            "rangos_edad": distintos("rango_edad"),
            "umas": [u["v"] for u in umas],
            "identificaciones": [i["v"] for i in idents]}


def fertilizantes_de_campana(empresa_id: int, anio: int) -> list[str]:
    """
    Fertilizantes que trajo el Excel de esa empresa en ese año.
    Cada empresa puede usar productos distintos: salen de los datos,
    no de una lista fija en el código.
    """
    filas = db.fetch_all("""
        SELECT DISTINCT kv.key AS producto
        FROM plantacion.fert_requerimiento r
        JOIN plantacion.fert_lote l    ON l.id = r.lote_id
        JOIN plantacion.fert_campana c ON c.id = l.campana_id,
             LATERAL jsonb_each(r.datos) kv
        WHERE c.empresa_id = %s AND c.anio = %s
        ORDER BY producto
    """, (empresa_id, anio))
    return [f["producto"] for f in filas]


def nutrientes_de_campana(empresa_id: int, anio: int,
                          tabla: str = "fert_foliar") -> list[str]:
    filas = db.fetch_all(f"""
        SELECT DISTINCT kv.key AS nutriente
        FROM plantacion.{tabla} t
        JOIN plantacion.fert_lote l    ON l.id = t.lote_id
        JOIN plantacion.fert_campana c ON c.id = l.campana_id,
             LATERAL jsonb_each(t.datos) kv
        WHERE c.empresa_id = %s AND c.anio = %s
    """, (empresa_id, anio))
    return [f["nutriente"] for f in filas]


def actualizar_lote(lote_id: int, datos: dict) -> bool:
    permitidos = ["identificacion", "uma", "sector", "zona", "rango_edad",
                  "palmas", "hectareas", "material", "siembra", "codigo",
                  "hoja", "mst", "tons"]
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


def identificaciones_de_campana(empresa_id: int, anio: int) -> list[str]:
    """Para precargar el formato de descarga con los lotes del año anterior."""
    filas = db.fetch_all("""
        SELECT l.identificacion FROM plantacion.fert_lote l
        JOIN plantacion.fert_campana c ON c.id = l.campana_id
        WHERE c.empresa_id = %s AND c.anio = %s
        ORDER BY l.uma NULLS LAST, l.identificacion
    """, (empresa_id, anio))
    return [f["identificacion"] for f in filas]
