"""
PalmaData · Mapas · Endpoints
=============================
Rutas bajo /api/mapas. Todas exigen sesión.

  Lotes · Descarga   /lotes, /lotes/descarga   (antes en Administración)
  Capas de fondo     /capas                    lotes y plantación
  Censo              /censo/catalogos, /censo/puntos?anio=&mes=
  Tratamientos       /tratamientos/catalogos, /tratamientos/puntos?anio=&mes=
  Plagas             /plagas/catalogos, /plagas/puntos?anio=&mes=
  Excel              POST /censo/excel, /tratamientos/excel, /plagas/excel
                     con los ids de lo que se ve en el mapa

Censo y Tratamientos devuelven TODAS las palmas del mes (ya con una fila
por palma) y la web filtra en el navegador: así marcar o desmarcar un
evento, un trabajador o un rango de días es instantáneo, sin volver a
consultar la base. Para que pese poco, cada palma va como una lista de
valores y no como un objeto, y la respuesta va comprimida.

Los ayudantes de sesión están copiados a propósito: módulo aislado.
"""
import gzip
import json
from datetime import date, datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from ...core import security
from . import exportar_lotes
from . import repository as repo
# El mismo generador de Excel y las mismas columnas de los consolidados de
# Sanidad: el archivo sale idéntico, solo cambia qué registros trae.
from ..sanidad.router import XLSX, _excel, COLUMNAS_CONSOLIDADO as COL_CENSO
from ..sanidad.router_trat import COLUMNAS_CONSOLIDADO as COL_TRAT
from ..sanidad.router_plagas import COLUMNAS_CONSOLIDADO as COL_PLAGAS

router = APIRouter(prefix="/api/mapas", tags=["mapas"])


def sesion(request: Request) -> dict:
    usuario = security.usuario_actual(request)
    if not usuario:
        raise HTTPException(401, "Sesión no iniciada.")
    return usuario


def _limpiar(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, date):
        return v.isoformat()
    if hasattr(v, "quantize"):
        return float(v)
    if hasattr(v, "strftime"):
        return v.strftime("%H:%M")
    return v


def _fila(f: dict) -> dict:
    return {k: _limpiar(v) for k, v in f.items()}


def _json(request: Request, datos: dict) -> Response:
    """
    JSON compacto y, si el navegador lo acepta (todos lo aceptan),
    comprimido: un mes con miles de palmas pasa de megas a unos cientos de KB.
    """
    cuerpo = json.dumps(datos, ensure_ascii=False, separators=(",", ":"),
                        default=_limpiar).encode("utf-8")
    if len(cuerpo) > 4096 and "gzip" in request.headers.get("accept-encoding", ""):
        return Response(gzip.compress(cuerpo, 5), media_type="application/json",
                        headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
    return Response(cuerpo, media_type="application/json")


def _mes(anio: int, mes: int):
    if not (2000 <= anio <= 2100) or not (1 <= mes <= 12):
        raise HTTPException(400, "Año o mes fuera de rango.")


def _hora(h) -> str | None:
    if h is None:
        return None
    return str(h)[:5]


def _nombres(filas: list[dict], clave_id: str, clave_nombre: str) -> dict:
    """{id: nombre} de lo que aparece en el mes, para no repetir el texto en cada palma."""
    salida = {}
    for f in filas:
        i = f.get(clave_id)
        if i is not None and i not in salida:
            salida[i] = f.get(clave_nombre)
    return salida


def _rango() -> dict:
    try:
        return _fila(repo.rango_fechas())
    except Exception as e:
        raise HTTPException(500, f"No se pudo leer el rango de fechas: {str(e).splitlines()[0]}. "
                                 "Revisa que se haya ejecutado 52_mapas.sql en esta base.")


# ============================================================
#  LOTES · DESCARGA  (antes Administración · Lotes)
# ============================================================

@router.get("/lotes")
def get_lotes(_=Depends(sesion)):
    """
    Lotes activos con sector y polígono. Solo consulta: la pantalla los lista
    y los dibuja; no hay nada que editar.
    """
    try:
        filas = repo.lotes_activos()
    except Exception as e:
        raise HTTPException(500, f"No se pudo leer los lotes: {str(e).split(chr(10))[0]}. "
                                 f"Revisa que se haya ejecutado 41_admin_lotes.sql en esta base.")
    features = [{"type": "Feature",
                 "properties": {"cat_lote_id": l["cat_lote_id"], "nombre": l["nombre"],
                                "cat_sector_id": l["cat_sector_id"], "sector": l["sector"]},
                 "geometry": l["geojson"]}
                for l in filas if l["geojson"]]
    return {"ok": True,
            "lotes": [_fila({k: v for k, v in l.items() if k != "geojson"}) for l in filas],
            "mapa": {"type": "FeatureCollection", "features": features}}


@router.get("/lotes/descarga")
def get_lotes_descarga(formato: str = Query(..., pattern="^(kml|shp)$"),
                       ids: str | None = Query(None, description="cat_lote_id separados por coma; vacío = todos"),
                       etiquetas: bool = Query(True),
                       _=Depends(sesion)):
    """
    Descarga los polígonos de los lotes, solo los polígonos (sin mapa de fondo).

    Con `ids` baja únicamente esos lotes (los seleccionados en la pantalla); sin
    `ids`, todos los lotes activos. `etiquetas` pone el nombre del lote sobre
    cada polígono: en KML directamente; en Shapefile con un .qml para QGIS.
    """
    lista: list[int] = []
    if ids and ids.strip():
        try:
            lista = sorted({int(x) for x in ids.split(",") if x.strip()})
        except ValueError:
            raise HTTPException(400, "La lista de lotes trae identificadores inválidos.")

    try:
        filas = repo.lotes_para_descarga(lista or None)
    except Exception as e:
        raise HTTPException(500, f"No se pudieron leer los polígonos: {str(e).split(chr(10))[0]}")

    if not filas:
        raise HTTPException(404, "Los lotes elegidos no tienen polígono para descargar."
                            if lista else "No hay lotes activos con polígono.")

    base = (f"lotes_{len(filas)}_seleccionados" if lista else "lotes_todos") \
        + f"_{date.today():%Y%m%d}"
    faltan = len(lista) - len(filas) if lista else 0
    cabeceras = {"X-Lotes-Exportados": str(len(filas)), "X-Lotes-Sin-Poligono": str(faltan)}

    if formato == "kml":
        contenido = exportar_lotes.kml(filas, etiquetas)
        cabeceras["Content-Disposition"] = f'attachment; filename="{base}.kml"'
        return Response(content=contenido, media_type="application/vnd.google-earth.kml+xml",
                        headers=cabeceras)

    srid = filas[0]["srid"]
    try:
        contenido = exportar_lotes.shp_zip(filas, etiquetas, repo.srid_wkt(srid) if srid else None)
    except RuntimeError as e:      # p. ej. falta pyshp en el servidor
        raise HTTPException(500, str(e))
    cabeceras["Content-Disposition"] = f'attachment; filename="{base}_shp.zip"'
    return Response(content=contenido, media_type="application/zip", headers=cabeceras)


# ============================================================
#  CAPAS DE FONDO
# ============================================================

@router.get("/capas")
def get_capas(request: Request, _=Depends(sesion)):
    """Lotes activos y polígono de la plantación, en GeoJSON lat/lon."""
    lotes = [{"type": "Feature",
              "properties": {"cat_lote_id": l["cat_lote_id"], "nombre": l["nombre"]},
              "geometry": l["geojson"]}
             for l in repo.capa_lotes() if l["geojson"]]
    try:
        plant = [{"type": "Feature", "properties": {"nombre": p["nombre"]},
                  "geometry": p["geojson"]}
                 for p in repo.capa_plantacion() if p["geojson"]]
    except Exception:
        plant = []          # sin la vista de plantación el mapa sirve igual
    return _json(request, {
        "ok": True,
        "lotes": {"type": "FeatureCollection", "features": lotes},
        "plantacion": {"type": "FeatureCollection", "features": plant}})


# ============================================================
#  CENSO
# ============================================================

CENSO_CAMPOS = ["id", "fecha", "hora", "lote", "linea", "palma",
                "enfermedad", "evento", "trabajador", "lon", "lat", "registros_mes"]


@router.get("/censo/catalogos")
def get_censo_catalogos(_=Depends(sesion)):
    try:
        eventos = repo.censo_eventos()
    except Exception as e:
        raise HTTPException(500, f"No se pudieron leer los eventos: {str(e).splitlines()[0]}. "
                                 "Revisa que se haya ejecutado 52_mapas.sql en esta base.")
    return {"ok": True, "eventos": [_fila(x) for x in eventos], "rango": _rango()}


@router.get("/censo/puntos")
def get_censo_puntos(request: Request,
                     anio: int = Query(...), mes: int = Query(...),
                     _=Depends(sesion)):
    """
    El censo del mes, todos los eventos, una fila por palma (su última
    clasificación del mes).
    Cada palma: [id, fecha, hora, lote, linea, palma, enfermedad_id,
    evento_id, trabajador_id, lon, lat, registros_mes]. Los nombres van una
    sola vez en los diccionarios.
    """
    _mes(anio, mes)
    filas = repo.censo_mes(anio, mes)
    datos = {
        "ok": True, "anio": anio, "mes": mes, "campos": CENSO_CAMPOS,
        "total": len(filas),
        "enfermedades": _nombres(filas, "san_enfermedades_id", "enfermedad"),
        "trabajadores": _nombres(filas, "evaluador", "trabajador"),
        "filas": [[f["id"], _limpiar(f["fecha"]), _hora(f["hora"]), f["lote"],
                   f["linea"], f["palma"], f["san_enfermedades_id"],
                   f["san_evento_enf_id"], f["evaluador"],
                   f["lon"], f["lat"], f["registros_mes"]] for f in filas],
    }
    return _json(request, datos)


# ============================================================
#  TRATAMIENTOS
# ============================================================

TRAT_CAMPOS = ["id", "fecha", "hora", "lote", "linea", "palma", "tratamiento",
               "enfermedad", "evento", "trabajador", "lon", "lat", "registros_mes",
               "ultimo_censo", "dias"]


@router.get("/tratamientos/catalogos")
def get_trat_catalogos(_=Depends(sesion)):
    cat = repo.trat_catalogos()
    return {"ok": True, "rango": _rango(),
            **{k: [_fila(x) for x in v] for k, v in cat.items()}}


@router.get("/tratamientos/puntos")
def get_trat_puntos(request: Request,
                    anio: int = Query(...), mes: int = Query(...),
                    _=Depends(sesion)):
    """
    Los tratamientos del mes, una fila por palma (su último tratamiento del
    mes), con la fecha de su último censo hasta ese día y los días entre
    los dos. Cada palma: [id, fecha, hora, lote, linea, palma, tratamiento_id,
    enfermedad_id, evento_id, trabajador_id, lon, lat, registros_mes,
    ultimo_censo, dias].
    """
    _mes(anio, mes)
    filas = repo.tratamientos_mes(anio, mes)
    datos = {
        "ok": True, "anio": anio, "mes": mes, "campos": TRAT_CAMPOS,
        "total": len(filas),
        "trabajadores": _nombres(filas, "aux_trabajador_id", "trabajador"),
        "filas": [[f["id"], _limpiar(f["fecha"]), _hora(f["hora"]), f["lote"],
                   f["linea"], f["palma"], f["san_evento_trat_id"],
                   f["san_enfermedades_id"], f["san_evento_enf_id"],
                   f["aux_trabajador_id"], f["lon"], f["lat"],
                   f["registros_mes"], _limpiar(f["ultimo_censo"]), f["dias"]]
                  for f in filas],
    }
    return _json(request, datos)


# ============================================================
#  PLAGAS
# ============================================================

PLAGAS_CAMPOS = ["id", "fecha", "palma_id", "lote", "linea", "palma", "insecto",
                 "cantidad", "trabajador", "lon", "lat", "dias_mes"]


@router.get("/plagas/catalogos")
def get_plagas_catalogos(_=Depends(sesion)):
    try:
        rango = _fila(repo.plagas_rango())
    except Exception as e:
        raise HTTPException(500, f"No se pudo leer el rango de fechas: {str(e).splitlines()[0]}. "
                                 "Revisa que se haya ejecutado 54_mapas_plagas_excel.sql en esta base.")
    return {"ok": True, "rango": rango,
            "insectos": [_fila(x) for x in repo.plagas_insectos()]}


@router.get("/plagas/puntos")
def get_plagas_puntos(request: Request,
                      anio: int = Query(...), mes: int = Query(...),
                      _=Depends(sesion)):
    """
    Las lecturas del mes (último día evaluado de cada palma), una por
    insecto: [id, fecha, palma_id, lote, linea, palma, insecto_id, cantidad,
    trabajador_id, lon, lat, dias_mes]. La web suma por palma según los
    insectos elegidos y arma el mapa de calor.
    """
    _mes(anio, mes)
    filas = repo.plagas_mes(anio, mes)
    datos = {
        "ok": True, "anio": anio, "mes": mes, "campos": PLAGAS_CAMPOS,
        "total": len(filas),
        "trabajadores": _nombres(filas, "evaluador", "trabajador"),
        "filas": [[f["id"], _limpiar(f["fecha"]), f["cat_palma_id"], f["lote"],
                   f["linea"], f["palma"], f["insectoid"],
                   _limpiar(f["cantidad"]) if f["cantidad"] is not None else 0,
                   f["evaluador"], f["lon"], f["lat"], f["dias_mes"]] for f in filas],
    }
    return _json(request, datos)


# ============================================================
#  EXCEL DE LO QUE SE VE EN EL MAPA
# ============================================================

MAX_IDS = 200_000
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def _pedido_excel(datos: dict) -> tuple[list[int], int, int, list[str]]:
    try:
        anio, mes = int(datos.get("anio")), int(datos.get("mes"))
    except (TypeError, ValueError):
        raise HTTPException(400, "Falta el año o el mes.")
    _mes(anio, mes)
    ids = datos.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(400, "No hay registros en el mapa para descargar.")
    if len(ids) > MAX_IDS:
        raise HTTPException(400, f"Son demasiados registros ({len(ids)}).")
    try:
        ids = sorted({int(x) for x in ids})
    except (TypeError, ValueError):
        raise HTTPException(400, "La lista de registros trae identificadores inválidos.")
    # Lo que el usuario tenía filtrado, para la hoja «filtros» del Excel
    filtros = [str(x)[:500] for x in (datos.get("filtros") or []) if x][:20]
    return ids, anio, mes, filtros


def _descarga(titulo: str, base: str, columnas, filas, anio, mes, filtros, nota_extra=""):
    if not filas:
        raise HTTPException(404, "Esos registros ya no están en el consolidado "
                                 "(pudieron anularse). Recarga el mapa.")
    nota = "\n".join([f"{titulo} · lo que se veía en el mapa",
                      f"Mes: {MESES[mes - 1]} de {anio}", *filtros,
                      f"Filas: {len(filas)}",
                      "Mismas columnas que el consolidado de Sanidad. No incluye anulados."]
                     + ([nota_extra] if nota_extra else []))
    contenido = _excel("consolidado", columnas, filas, nota)
    archivo = f"mapa_{base}_{anio}{mes:02d}.xlsx"
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})


@router.post("/censo/excel")
def post_censo_excel(datos: dict = Body(...), _=Depends(sesion)):
    """El consolidado del censo, solo con las palmas que se ven en el mapa."""
    ids, anio, mes, filtros = _pedido_excel(datos)
    return _descarga("Mapas · Censo", "censo", COL_CENSO, repo.excel_censo(ids),
                     anio, mes, filtros,
                     "Una fila por palma: su último registro del mes.")


@router.post("/tratamientos/excel")
def post_trat_excel(datos: dict = Body(...), _=Depends(sesion)):
    """El consolidado de tratamientos (una fila por producto) de lo que se ve."""
    ids, anio, mes, filtros = _pedido_excel(datos)
    return _descarga("Mapas · Tratamientos", "tratamientos", COL_TRAT,
                     repo.excel_tratamientos(ids), anio, mes, filtros,
                     "Una palma por mes (su último tratamiento); una fila por producto aplicado.")


@router.post("/plagas/excel")
def post_plagas_excel(datos: dict = Body(...), _=Depends(sesion)):
    """El consolidado de plagas, solo con las lecturas que suman en el mapa."""
    ids, anio, mes, filtros = _pedido_excel(datos)
    return _descarga("Mapas · Plagas", "plagas", COL_PLAGAS, repo.excel_plagas(ids),
                     anio, mes, filtros,
                     "Solo el último día evaluado de cada palma en el mes.")
