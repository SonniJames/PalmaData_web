"""
PalmaData · Administración · Trampas · Repositorio
==================================================
Tabla maestra plantacion.santrampa: crear, corregir, anular y reactivar.

`estado` es la baja (1 activa, 0 inactiva): no hay columna `anulado`
aparte. Se considera activa toda trampa cuyo estado no sea 0, incluidos
los NULL — el criterio está escrito en la vista v_admin_trampas.

geom la calcula el trigger a partir de x e y; aquí nunca se escribe.
"""
from ...core import db


# ============================================================
#  LISTADO
# ============================================================

def listar(busqueda: str | None = None, cat_lote_id: int | None = None,
           ver_anuladas: bool = False, limite: int = 2000) -> list[dict]:
    """`ver_anuladas` muestra SOLO las inactivas."""
    sql = """
        SELECT v.santrampaid, v.codigo, v.instalacion, v.x, v.y,
               v.estado, v.activa, v.cat_lote_id, v.lote, v.tiene_geom,
               v.agregado_por, v.creado_at,
               v.corregido_por, v.corregido_at,
               v.anulado_por, v.anulado_en, v.anulado_motivo
        FROM plantacion.v_admin_trampas v
        WHERE (%s::text IS NULL OR v.codigo ILIKE %s::text)
          AND (%s::bigint IS NULL OR v.cat_lote_id = %s::bigint)
    """
    patron = f"%{busqueda.strip()}%" if busqueda and busqueda.strip() else None
    params: list = [patron, patron, cat_lote_id, cat_lote_id]

    sql += " AND NOT v.activa" if ver_anuladas else " AND v.activa"
    sql += " ORDER BY v.codigo NULLS LAST LIMIT %s"
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def buscar_codigos(busqueda: str, limite: int = 40) -> list[dict]:
    """Sugerencias del buscador por código."""
    return db.fetch_all("""
        SELECT santrampaid, codigo, lote, activa
        FROM plantacion.v_admin_trampas
        WHERE codigo ILIKE %s
        ORDER BY activa DESC, codigo LIMIT %s
    """, (f"%{busqueda.strip()}%", limite))


def listar_lotes(busqueda: str | None = None, limite: int = 500) -> list[dict]:
    if busqueda and busqueda.strip():
        return db.fetch_all("""
            SELECT cat_lote_id, nombre FROM plantacion.cat_lote
            WHERE nombre ILIKE %s ORDER BY nombre LIMIT %s
        """, (f"%{busqueda.strip()}%", limite))
    return db.fetch_all("""
        SELECT cat_lote_id, nombre FROM plantacion.cat_lote
        ORDER BY nombre LIMIT %s
    """, (limite,))


def resumen() -> dict:
    fila = db.fetch_one("SELECT * FROM plantacion.trampa_resumen()")
    return dict(fila) if fila else {}


# ============================================================
#  ALTA, CORRECCIÓN Y BAJA
# ============================================================

def crear(codigo: str, instalacion, x: float, y: float, estado: int,
          cat_lote_id: int | None, usuario: str) -> int:
    """Devuelve el santrampaid nuevo que asignó PostgreSQL."""
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.trampa_crear(
                %s::varchar, %s::date, %s::double precision, %s::double precision,
                %s::integer, %s::bigint, %s::text) AS id
        """, (codigo, instalacion, x, y, estado, cat_lote_id, usuario))
        return (cur.fetchone() or {}).get("id")


def corregir(id_trampa: int, usuario: str, campos: dict) -> int:
    """Los None no se tocan: `instalacion` solo cambia si se envía."""
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.trampa_corregir(
                %s, %s::text, %s::varchar, %s::date,
                %s::double precision, %s::double precision,
                %s::integer, %s::bigint) AS n
        """, (id_trampa, usuario, campos.get("codigo"), campos.get("instalacion"),
              campos.get("x"), campos.get("y"), campos.get("estado"),
              campos.get("cat_lote_id")))
        return (cur.fetchone() or {}).get("n", 0)


def anular(ids: list[int], usuario: str, motivo: str | None = None) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.trampa_anular(%s, %s::text, %s::varchar) AS n",
                    (ids, usuario, motivo))
        return (cur.fetchone() or {}).get("n", 0)


def reactivar(ids: list[int], usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.trampa_reactivar(%s, %s::text) AS n",
                    (ids, usuario))
        return (cur.fetchone() or {}).get("n", 0)
