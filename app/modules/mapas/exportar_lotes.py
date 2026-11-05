"""
PalmaData · Mapas · Lotes · Descarga · Exportar polígonos
=========================================================
Arma los archivos de descarga a partir de lo que entrega
repository.lotes_para_descarga(). Aquí no hay SQL.

  KML  -> un .kml para Google Earth. Siempre en lat/lon (WGS84): el
          formato no admite otro sistema. Con etiqueta, cada lote lleva un
          punto invisible dentro del polígono con el nombre encima; sin
          etiqueta, el nombre solo aparece en la lista lateral y al hacer clic.

  SHP  -> un .zip con .shp .shx .dbf .prj .cpg, en el sistema de la base
          (MAGNA-SIRGAS / Colombia Bogotá, EPSG:3116, en metros), que es lo
          que se usa en QGIS/ArcGIS para medir. El Shapefile no guarda
          estilos: el nombre siempre va como atributo (columna LOTE) y, si se
          pide con etiqueta, se agrega un .qml que QGIS carga solo al abrir
          la capa y que pinta el nombre sobre cada polígono.
"""
from datetime import date
from io import BytesIO
from xml.sax.saxutils import escape
import zipfile

NOMBRE_CAPA = "lotes"

# KML usa colores aabbggrr. Los mismos verdes del mapa de la web.
_KML_LINEA = "ff466b2f"     # #2f6b46
_KML_RELLENO = "598fb479"   # #79b48f al 35 %


def _txt(v) -> str:
    return "" if v is None else str(v)


def _datos_kml(f: dict) -> str:
    campos = [("Lote", f["nombre"]), ("Id", f["cat_lote_id"]), ("Sector", f["sector"]),
              ("Siembra", f["siembra"]), ("Palmas", f["palmas"]),
              ("Material", f["material"]), ("Área (ha)", f["area_ha"])]
    return "".join(f'<Data name="{escape(n)}"><value>{escape(_txt(v))}</value></Data>'
                   for n, v in campos)


def kml(filas: list[dict], etiquetas: bool) -> bytes:
    estilo_etiqueta = (
        # El ícono se oculta (escala 0) para que solo se vea el texto.
        "<IconStyle><scale>0</scale><Icon></Icon></IconStyle>"
        "<LabelStyle><color>ffffffff</color><scale>0.9</scale></LabelStyle>"
        if etiquetas else
        "<LabelStyle><scale>0</scale></LabelStyle>")

    marcas = []
    for f in filas:
        geom = f["kml"]
        if etiquetas:
            # Polígono + punto interior en una sola marca: Google Earth pone
            # el nombre sobre el punto, y el punto no se ve.
            geom = f"<MultiGeometry>{geom}{f['kml_etiqueta']}</MultiGeometry>"
        marcas.append(
            f"<Placemark><name>{escape(_txt(f['nombre']))}</name>"
            f"<styleUrl>#lote</styleUrl>"
            f"<ExtendedData>{_datos_kml(f)}</ExtendedData>{geom}</Placemark>")

    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
        f"<name>Lotes · {date.today():%Y-%m-%d}</name>"
        f'<Style id="lote">{estilo_etiqueta}'
        f"<LineStyle><color>{_KML_LINEA}</color><width>1.5</width></LineStyle>"
        f"<PolyStyle><color>{_KML_RELLENO}</color></PolyStyle></Style>"
        f"<Folder><name>Lotes ({len(filas)})</name>{''.join(marcas)}</Folder>"
        "</Document></kml>")
    return doc.encode("utf-8")


# Estilo de QGIS: solo activa las etiquetas con la columna LOTE. No toca la
# simbología, así cada quien conserva sus colores.
_QML_ETIQUETAS = """<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.28" styleCategories="Labeling" labelsEnabled="1">
  <labeling type="simple">
    <settings calloutType="simple">
      <text-style fieldName="LOTE" isExpression="0" fontSize="9" fontWeight="75"
                  textColor="30,30,30,255" textOpacity="1" fontSizeUnit="Point">
        <text-buffer bufferDraw="1" bufferSize="1" bufferSizeUnits="MM"
                     bufferColor="255,255,255,255" bufferOpacity="1"/>
      </text-style>
      <placement placement="1" centroidInside="1" centroidWhole="0" fitInPolygonOnly="0"/>
      <rendering obstacle="1" displayAll="1" upsidedownLabels="0"/>
    </settings>
  </labeling>
</qgis>
"""


def _anillos(geojson: dict) -> list:
    """Todos los anillos de un Polygon o MultiPolygon, para pyshp."""
    if not geojson:
        return []
    if geojson["type"] == "Polygon":
        return list(geojson["coordinates"])
    if geojson["type"] == "MultiPolygon":
        return [anillo for poligono in geojson["coordinates"] for anillo in poligono]
    return []


def shp_zip(filas: list[dict], etiquetas: bool, prj: str | None) -> bytes:
    # La librería se importa AQUÍ y no al principio del archivo: si faltara
    # en el servidor, solo fallaría la descarga en Shapefile. Importada
    # arriba, tumbaba el módulo completo al arrancar.
    try:
        import shapefile   # pyshp
    except ImportError:
        raise RuntimeError("Falta la librería pyshp en el servidor. Instálala con "
                           "venv/bin/pip install pyshp==3.1.6 y reinicia palmadata_web.")

    shp, shx, dbf = BytesIO(), BytesIO(), BytesIO()
    w = shapefile.Writer(shp=shp, shx=shx, dbf=dbf,
                         shapeType=shapefile.POLYGON, encoding="utf-8")
    # Los nombres de columna del DBF tienen tope de 10 caracteres.
    w.field("LOTE_ID", "N", 12, 0)
    w.field("LOTE", "C", 50)
    w.field("SECTOR", "C", 60)
    w.field("SIEMBRA", "D")
    w.field("PALMAS", "N", 10, 0)
    w.field("MATERIAL", "C", 60)
    w.field("AREA_HA", "N", 12, 2)

    for f in filas:
        anillos = _anillos(f["geojson"])
        if not anillos:
            continue
        # Los anillos ya vienen orientados por PostGIS (ST_ForcePolygonCW).
        w.poly(anillos)
        w.record(f["cat_lote_id"], _txt(f["nombre"]), _txt(f["sector"]),
                 f["siembra"], f["palmas"], _txt(f["material"]),
                 float(f["area_ha"]) if f["area_ha"] is not None else None)
    w.close()

    salida = BytesIO()
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"{NOMBRE_CAPA}.shp", shp.getvalue())
        z.writestr(f"{NOMBRE_CAPA}.shx", shx.getvalue())
        z.writestr(f"{NOMBRE_CAPA}.dbf", dbf.getvalue())
        z.writestr(f"{NOMBRE_CAPA}.cpg", "UTF-8")      # tildes y eñes bien leídas
        if prj:
            z.writestr(f"{NOMBRE_CAPA}.prj", prj)
        if etiquetas:
            z.writestr(f"{NOMBRE_CAPA}.qml", _QML_ETIQUETAS)
    return salida.getvalue()
