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


def todos_para_excel() -> list[dict]:
    """Toda la tabla, activos y anulados, para la descarga. Sin filtros."""
    return db.fetch_all("""
        SELECT v.aux_trabajador_id, v.nombre, v.documento,
               CASE WHEN v.activo THEN 'Activo' ELSE 'Anulado' END AS estado_txt,
               CASE WHEN v.es_supervisor THEN 'Sí' ELSE 'No' END AS supervisor_txt,
               v.codigo_sip, v.cargo, v.agregado_por, v.creado_at,
               v.corregido_por, v.corregido_at, v.anulado_por, v.anulado_en, v.anulado_motivo
        FROM plantacion.v_personal v
        ORDER BY v.activo DESC, v.nombre NULLS LAST
    """)


# ============================================================
#  LOTES · solo consulta
# ============================================================

def lotes_para_descarga(ids: list[int] | None = None) -> list[dict]:
    """
    Lotes activos con su polígono, listos para exportar a KML o Shapefile.

    `ids` vacío o None = todos. Se devuelven tres versiones de la geometría:
      kml          el polígono en KML (ST_AsKML ya lo pasa a lat/lon 4326)
      kml_etiqueta un punto DENTRO del polígono, donde va el nombre. Se usa
                   ST_PointOnSurface y no el centroide: en un lote en forma
                   de L o de C el centroide puede caer fuera.
      geojson      el polígono en el sistema de la base (3116, metros), con
                   los anillos orientados como exige el Shapefile: exterior en
                   sentido horario, huecos al contrario (ST_ForcePolygonCW).
    """
    sql = """
        SELECT l.cat_lote_id,
               l.nombre,
               l.siembra::date                                       AS siembra,
               l.palmas,
               l.material,
               s.nombre                                              AS sector,
               ROUND((public.ST_Area(public.ST_Transform(g.geom, 3116)) / 10000)::numeric, 2)
                                                                     AS area_ha,
               public.ST_AsKML(g.geom, 7)                            AS kml,
               public.ST_AsKML(public.ST_PointOnSurface(g.geom), 7)  AS kml_etiqueta,
               public.ST_AsGeoJSON(public.ST_ForcePolygonCW(g.geom), 3)::json AS geojson,
               public.ST_SRID(g.geom)                                AS srid
        FROM plantacion.cat_lote l
        LEFT JOIN plantacion.cat_sector s ON s.cat_sector_id = l.sector0
        -- ST_MakeValid: un polígono con autointersecciones rompe el
        -- Shapefile en algunos programas. Al repararlo puede soltar líneas
        -- o puntos sueltos; CollectionExtract(…, 3) se queda solo con los
        -- polígonos. Force2D: el SHP va en 2D.
        CROSS JOIN LATERAL (SELECT public.ST_Force2D(public.ST_CollectionExtract(
                                public.ST_MakeValid(l.geom), 3)) AS geom) g
        WHERE l.estado = 1 AND l.geom IS NOT NULL
    """
    params: list = []
    if ids:
        sql += " AND l.cat_lote_id = ANY(%s)"
        params.append(ids)
    sql += " ORDER BY s.nombre NULLS LAST, l.nombre"
    return db.fetch_all(sql, tuple(params))


def srid_wkt(srid: int) -> str | None:
    """Definición del sistema de coordenadas, para el .prj del Shapefile."""
    fila = db.fetch_one("SELECT srtext FROM public.spatial_ref_sys WHERE srid = %s", (srid,))
    return fila["srtext"] if fila else None


def lotes_activos() -> list[dict]:
    """Lotes con estado = 1, su sector y la geometría para el mapa."""
    return db.fetch_all("""
        SELECT cat_lote_id, nombre, siembra, palmas, material,
               cat_sector_id, sector, tiene_geom, geojson
        FROM plantacion.v_admin_lotes
        ORDER BY sector NULLS LAST, nombre
    """)
