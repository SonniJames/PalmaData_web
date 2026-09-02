"""
PalmaData · Administración · Personal · Repositorio
===================================================
Tabla maestra plantacion.aux_trabajador: crear, corregir, anular y
reactivar trabajadores. Una sola pantalla, sin revisión/descargas.

`estado` es la baja (1 activo, 0 anulado): no hay columna `anulado`
aparte. Se considera activo todo lo que no sea 0, incluidos los NULL de
registros antiguos — el criterio está escrito en la vista v_personal.
"""
from ...core import db


# ============================================================
#  LISTADO
# ============================================================

def listar(busqueda: str | None = None, ver_anulados: bool = False,
           solo_supervisores: bool = False, limite: int = 2000) -> list[dict]:
    """
    Trabajadores para la tabla. `ver_anulados` muestra SOLO los anulados,
    igual que en el resto de la web.
    """
    sql = """
        SELECT v.aux_trabajador_id, v.nombre, v.documento, v.estado, v.activo,
               v.supervisor, v.es_supervisor, v.codigo_sip, v.cargo,
               v.agregado_por, v.creado_at,
               v.corregido_por, v.corregido_at,
               v.anulado_por, v.anulado_en, v.anulado_motivo
        FROM plantacion.v_personal v
        WHERE (%s::text IS NULL OR v.nombre ILIKE %s::text
                                OR v.documento ILIKE %s::text)
    """
    patron = f"%{busqueda.strip()}%" if busqueda and busqueda.strip() else None
    params: list = [patron, patron, patron]

    sql += " AND NOT v.activo" if ver_anulados else " AND v.activo"
    if solo_supervisores:
        sql += " AND v.es_supervisor"

    sql += " ORDER BY v.nombre NULLS LAST LIMIT %s"
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def buscar_nombres(busqueda: str, limite: int = 40) -> list[dict]:
    """Sugerencias para el buscador de la pantalla."""
    return db.fetch_all("""
        SELECT aux_trabajador_id, nombre, documento, activo
        FROM plantacion.v_personal
        WHERE nombre ILIKE %s
        ORDER BY activo DESC, nombre LIMIT %s
    """, (f"%{busqueda.strip()}%", limite))


def resumen() -> dict:
    fila = db.fetch_one("SELECT * FROM plantacion.personal_resumen()")
    return dict(fila) if fila else {}


# ============================================================
#  ALTA, CORRECCIÓN Y BAJA
# ============================================================

def crear(nombre: str, documento: str | None, supervisor: int,
          sucursal: str | None, usuario: str) -> int:
    """Devuelve el aux_trabajador_id nuevo que asignó PostgreSQL."""
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.personal_crear(
                %s::varchar, %s::varchar, %s::integer, %s::varchar, %s::text) AS id
        """, (nombre, documento, supervisor, sucursal, usuario))
        return (cur.fetchone() or {}).get("id")


def corregir(id_trabajador: int, usuario: str, campos: dict) -> int:
    """Corrige los mismos campos que se ingresan. Los None no se tocan."""
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.personal_corregir(
                %s, %s::text, %s::varchar, %s::varchar,
                %s::integer, %s::varchar) AS n
        """, (id_trabajador, usuario, campos.get("nombre"),
              campos.get("documento"), campos.get("supervisor"),
              campos.get("sucursal")))
        return (cur.fetchone() or {}).get("n", 0)


def anular(ids: list[int], usuario: str, motivo: str | None = None) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.personal_anular(%s, %s::text, %s::varchar) AS n",
                    (ids, usuario, motivo))
        return (cur.fetchone() or {}).get("n", 0)


def reactivar(ids: list[int], usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.personal_reactivar(%s, %s::text) AS n",
                    (ids, usuario))
        return (cur.fetchone() or {}).get("n", 0)
