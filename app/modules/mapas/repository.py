"""
PalmaData · Mapas · Repositorio
===============================
Lotes · Descarga  (se movió desde Administración, sin cambios de fondo)
Capas de fondo    lotes y plantación en lat/lon, para Censo y Tratamientos
Censo             plantacion.mapa_censo_mes(año, mes), todos los eventos
Tratamientos      plantacion.mapa_tratamientos_mes(año, mes)
Plagas            plantacion.mapa_plagas_mes(año, mes)
Excel             los consolidados de Sanidad, solo con lo que se ve en el mapa

La regla de «una palma por mes, con su último registro» y el cálculo de
los días desde el último censo viven en la base (script 52). Aquí solo se
consulta.
"""
from ...core import db


# ============================================================
#  LOTES · DESCARGA
# ============================================================

def lotes_activos() -> list[dict]:
    """Lotes con estado = 1, su sector y la geometría para el mapa."""
    return db.fetch_all("""
        SELECT cat_lote_id, nombre, siembra, palmas, material,
               cat_sector_id, sector, tiene_geom, geojson
        FROM plantacion.v_admin_lotes
        ORDER BY sector NULLS LAST, nombre
    """)


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


# ============================================================
#  CAPAS DE FONDO · Censo y Tratamientos
# ============================================================

def capa_lotes() -> list[dict]:
    """Polígonos de los lotes activos en lat/lon (la misma vista de Recorridos)."""
    return db.fetch_all("""
        SELECT cat_lote_id, nombre, geojson
        FROM plantacion.v_lotes_mapa ORDER BY nombre
    """)


def capa_plantacion() -> list[dict]:
    """El polígono de la plantación. Puede no existir la vista: es opcional."""
    return db.fetch_all("""
        SELECT cat_plantacion_id, nombre, geojson
        FROM plantacion.v_plantacion_mapa ORDER BY nombre
    """)


def rango_fechas() -> dict:
    fila = db.fetch_one("SELECT * FROM plantacion.mapa_rango_fechas()")
    return dict(fila) if fila else {}


# ============================================================
#  CENSO
# ============================================================

def censo_eventos() -> list[dict]:
    """
    TODOS los eventos del catálogo, con su enfermedad. `color` viene de
    mapa_evento_color solo en los que tienen color fijo; los demás llegan en
    NULL y la web les asigna uno. Primero los de color fijo, en su orden.
    """
    return db.fetch_all("""
        SELECT e.san_evento_enf_id AS id, e.codigo, e.san_enfermedades_id,
               en.nombre AS enfermedad, m.color, m.orden
        FROM plantacion.san_evento_enf e
        LEFT JOIN plantacion.mapa_evento_color m ON m.san_evento_enf_id = e.san_evento_enf_id
        LEFT JOIN plantacion.san_enfermedades en ON en.san_enfermedades_id = e.san_enfermedades_id
        ORDER BY m.orden NULLS LAST, en.nombre NULLS LAST, e.codigo
    """)


def censo_mes(anio: int, mes: int) -> list[dict]:
    return db.fetch_all("""
        SELECT san_enf_lectura_id AS id, fecha, hora, lote, linea, palma,
               san_enfermedades_id, enfermedad, san_evento_enf_id, evento,
               evaluador, trabajador, lon, lat, registros_mes
        FROM plantacion.mapa_censo_mes(%s, %s)
    """, (anio, mes))


# ============================================================
#  TRATAMIENTOS
# ============================================================

def trat_catalogos() -> dict:
    """
    Los tres catálogos de los filtros, completos. El de eventos trae su
    enfermedad: la web solo muestra los de las enfermedades elegidas.
    """
    return {
        "tratamientos": db.fetch_all("""
            SELECT san_evento_trat_id AS id, codigo, descripcion
            FROM plantacion.san_evento_trat ORDER BY codigo
        """),
        "enfermedades": db.fetch_all("""
            SELECT san_enfermedades_id AS id, nombre
            FROM plantacion.san_enfermedades ORDER BY nombre
        """),
        "eventos": db.fetch_all("""
            SELECT san_evento_enf_id AS id, codigo, san_enfermedades_id
            FROM plantacion.san_evento_enf ORDER BY codigo
        """),
    }


def tratamientos_mes(anio: int, mes: int) -> list[dict]:
    return db.fetch_all("""
        SELECT san_enf_tratamiento_id AS id, fecha, hora, lote, linea, palma,
               san_evento_trat_id, tratamiento, san_enfermedades_id, enfermedad,
               san_evento_enf_id, evento, aux_trabajador_id, trabajador,
               lon, lat, registros_mes, ultimo_censo, dias
        FROM plantacion.mapa_tratamientos_mes(%s, %s)
    """, (anio, mes))


# ============================================================
#  PLAGAS
# ============================================================

def plagas_rango() -> dict:
    fila = db.fetch_one("SELECT * FROM plantacion.mapa_plagas_rango()")
    return dict(fila) if fila else {}


def plagas_insectos() -> list[dict]:
    return db.fetch_all("""
        SELECT id, insecto FROM plantacion.saninsectos ORDER BY insecto
    """)


def plagas_mes(anio: int, mes: int) -> list[dict]:
    """Una fila por lectura, solo del último día evaluado de cada palma."""
    return db.fetch_all("""
        SELECT sanplagaslecturaid AS id, fecha, hora, cat_palma_id, lote, linea, palma,
               insectoid, insecto, estadoinsectoid, estado, cantidad,
               evaluador, trabajador, lon, lat, dias_mes
        FROM plantacion.mapa_plagas_mes(%s, %s)
    """, (anio, mes))


# ============================================================
#  EXCEL DE LO QUE SE VE EN EL MAPA
#  Las mismas columnas y el mismo orden que los consolidados de Sanidad,
#  pero solo con los registros que la web manda (los del mapa).
# ============================================================

def excel_censo(ids: list[int]) -> list[dict]:
    return db.fetch_all("""
        SELECT c."Fecha"          AS fecha,
               c."Time"           AS hora,
               c."EVALUADOR"      AS evaluador,
               c."LOTE"           AS lote,
               c."BLOQUE"         AS bloque,
               c."LINEA"          AS linea,
               c."PALMA"          AS palma,
               c."EVENTO"         AS evento,
               c."Romano"         AS romano,
               c."Observaciones"  AS observaciones,
               c."GEOM"           AS geom
        FROM plantacion.v_censo_consolidado c
        WHERE c.registro_id = ANY(%s)
        ORDER BY c.fecha_filtro, c."LOTE", c."LINEA", c."PALMA"
    """, (ids,))


def excel_tratamientos(ids: list[int]) -> list[dict]:
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
               c."OBSERVACIONES"  AS observaciones,
               c."EQUIPO"         AS equipo,
               c."CATEGORIA"      AS categoria,
               c."PRODUCTO"       AS producto,
               c."UNIDAD"         AS unidad,
               c."AREA INTERVENIDA" AS area_intervenida,
               c."REMISION"       AS remision,
               c."GEOM"           AS geom,
               c."N PRODUCTO"     AS n_producto
        FROM plantacion.v_trat_consolidado_ext c
        WHERE c."REGISTRO ID" = ANY(%s)
        ORDER BY c.fecha_filtro, c."LOTE", c."LINEA", c."PALMA", c."REGISTRO ID", c."N PRODUCTO"
    """, (ids,))


def excel_plagas(ids: list[int]) -> list[dict]:
    return db.fetch_all("""
        SELECT c."LECTURA"        AS lectura,
               c."FECHA"          AS fecha,
               c."HORA"           AS hora,
               c."LOTE"           AS lote,
               c."LINEA"          AS linea,
               c."PALMA"          AS palma,
               c."INSECTO"        AS insecto,
               c."ESTADO"         AS estado,
               c."CANTIDAD"       AS cantidad,
               c."NIVEL FOLIAR"   AS nivfoliar,
               c."HOJA 5"         AS defol5,
               c."HOJA 13"        AS defol13,
               c."HOJA 21"        AS defol21,
               c."HOJA 29"        AS defol29,
               c."HOJA 37"        AS defol37,
               c."EVALUADOR"      AS evaluador,
               c."OBSERVACIONES"  AS observaciones,
               c."GEOM"           AS geom
        FROM plantacion.v_plagas_consolidado c
        WHERE c.registro_id = ANY(%s)
        ORDER BY c.fecha_filtro, c."LOTE", c."LINEA", c."PALMA", c."HORA"
    """, (ids,))
