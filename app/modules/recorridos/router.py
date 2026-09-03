"""
PalmaData · Recorridos · Endpoints
==================================
Rutas bajo /api/recorridos. Todas exigen sesión.

El recorrido se pide con trabajador + fecha, nunca todos a la vez.
Los ayudantes de sesión están copiados a propósito: módulo aislado.
"""
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ...core import security
from . import repository as repo

router = APIRouter(prefix="/api/recorridos", tags=["recorridos"])


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


def _exigir_una_fecha(fecha, actualiza):
    if not fecha and not actualiza:
        raise HTTPException(400, "Selecciona una fecha: del recorrido o de actualización.")
    if fecha and actualiza:
        raise HTTPException(400, "Elige una sola fecha: del recorrido o de actualización.")


@router.get("/fechas")
def get_fechas(_=Depends(sesion)):
    """Días con recorrido y días de descarga, para los selectores."""
    return {"ok": True,
            "fechas": [_fila(x) for x in repo.fechas_disponibles()],
            "actualizaciones": [_fila(x) for x in repo.fechas_actualizacion()]}


@router.get("/trabajadores")
def get_trabajadores(fecha: date | None = Query(None),
                     actualiza: date | None = Query(None),
                     _=Depends(sesion)):
    """Trabajadores con recorrido en esa fecha. Sin geometría."""
    _exigir_una_fecha(fecha, actualiza)
    return {"ok": True,
            "trabajadores": [_fila(x) for x in repo.trabajadores(fecha, actualiza)]}


@router.get("/lotes")
def get_lotes(_=Depends(sesion)):
    """GeoJSON de los lotes activos. Se carga una sola vez por sesión."""
    features = [{"type": "Feature",
                 "properties": {"cat_lote_id": l["cat_lote_id"], "nombre": l["nombre"]},
                 "geometry": l["geojson"]}
                for l in repo.lotes()]
    return {"type": "FeatureCollection", "features": features}


@router.get("/plantacion")
def get_plantacion(_=Depends(sesion)):
    """GeoJSON del polígono de la plantación. Se pinta debajo de los lotes."""
    features = [{"type": "Feature",
                 "properties": {"cat_plantacion_id": p["cat_plantacion_id"], "nombre": p["nombre"]},
                 "geometry": p["geojson"]}
                for p in repo.plantacion()]
    return {"type": "FeatureCollection", "features": features}


@router.get("/recorrido")
def get_recorrido(trabajador: int = Query(...),
                  fecha: date | None = Query(None),
                  actualiza: date | None = Query(None),
                  _=Depends(sesion)):
    """
    El recorrido de UN trabajador en la fecha elegida, como GeoJSON con
    sus datos (labores, fertilizantes, horas, puntos, distancia).
    """
    _exigir_una_fecha(fecha, actualiza)
    filas = repo.recorridos(trabajador, fecha, actualiza)
    if not filas:
        raise HTTPException(404, "Ese trabajador no tiene recorrido en esa fecha.")

    features = []
    for r in filas:
        props = _fila({k: v for k, v in r.items() if k != "geojson"})
        features.append({"type": "Feature", "properties": props,
                         "geometry": r["geojson"]})
    return {"ok": True, "total": len(features),
            "recorridos": {"type": "FeatureCollection", "features": features}}
