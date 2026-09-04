"""
PalmaData · Supervisión · Cosecha vagón · Endpoints
===================================================
Rutas bajo /api/supervision/vagon. Todas exigen sesión.
Solo consulta y descarga: la tabla que se ve es la que se baja.

Se monta dentro del router de supervisión, con prefijo RELATIVO, y
reutiliza sus ayudantes (sesión, Excel, limpieza).
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from . import repository_vagon as repo
from .router import XLSX, _excel, _fila, _limpiar, _nombre, sesion

router_vagon = APIRouter(prefix="/vagon", tags=["supervision-vagon"])

# La tabla de la pantalla y la del Excel son la misma.
COLUMNAS = [
    ("fecha", "FECHA"), ("hora", "HORA"),
    ("supervisor", "SUPERVISOR"), ("lote", "LOTE"),
    ("racimos_verdes", "RACIMOS VERDES"),
    ("racimos_sobremaduros", "RACIMOS SOBREMADUROS"),
    ("racimos_podridos", "RACIMOS PODRIDOS"),
    ("pedunculo_largo", "PEDUNCULO LARGO"),
    ("racimos_muestra", "RACIMOS MUESTRA"),
    ("racimos_malformados", "RACIMOS MAL FORMADOS"),
    ("racimos_enfermos", "RACIMOS ENFERMOS"),
    ("racimos_eupalamides", "RACIMOS EUPALAMIDES"),
    ("observaciones", "OBSERVACIONES"),
    ("trabajador", "TRABAJADOR"),
]

ROLES = ("supervisor", "trabajador")


def _filtros(fecha_desde=None, fecha_hasta=None, actualiza_desde=None,
             actualiza_hasta=None, cat_lote_id=None, supervisor=None,
             trabajador=None) -> dict:
    return {"fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta,
            "actualiza_desde": actualiza_desde, "actualiza_hasta": actualiza_hasta,
            "cat_lote_id": cat_lote_id, "supervisor": supervisor,
            "trabajador": trabajador}


def _exigir_fecha(f: dict):
    if not any([f.get("fecha_desde"), f.get("fecha_hasta"),
                f.get("actualiza_desde"), f.get("actualiza_hasta")]):
        raise HTTPException(400, "Selecciona un rango de fechas: por fecha "
                                 "del evento o por fecha de actualización.")


@router_vagon.get("/catalogos")
def get_catalogos(_=Depends(sesion)):
    return {"ok": True,
            "personas": {rol: [_fila(x) for x in repo.personas(rol)] for rol in ROLES},
            "lotes": [_fila(x) for x in repo.lotes()],
            "fechas": [_fila(x) for x in repo.fechas_disponibles()],
            "actualizaciones": [_fila(x) for x in repo.fechas_actualizacion()]}


@router_vagon.get("")
def get_vagon(fecha_desde: date | None = Query(None),
              fecha_hasta: date | None = Query(None),
              actualiza_desde: date | None = Query(None),
              actualiza_hasta: date | None = Query(None),
              cat_lote_id: int | None = Query(None),
              supervisor: int | None = Query(None),
              trabajador: int | None = Query(None),
              limite: int = Query(5000, ge=1, le=50000),
              _=Depends(sesion)):
    """
    Los registros de supervisión en vagón. El filtro de trabajador trae los
    registros donde esa persona aparece, sola o acompañada.
    """
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta,
                 cat_lote_id, supervisor, trabajador)
    _exigir_fecha(f)

    filas = repo.listar(f, limite)
    return {"ok": True, "filtros": {k: _limpiar(v) for k, v in f.items()},
            "total": len(filas), "limite": limite,
            "truncado": len(filas) >= limite,
            "columnas": [e for _c, e in COLUMNAS],
            "resumen": _fila(repo.resumen(f)),
            "registros": [_fila(x) for x in filas]}


@router_vagon.get("/excel")
def get_vagon_excel(fecha_desde: date | None = Query(None),
                    fecha_hasta: date | None = Query(None),
                    actualiza_desde: date | None = Query(None),
                    actualiza_hasta: date | None = Query(None),
                    cat_lote_id: int | None = Query(None),
                    supervisor: int | None = Query(None),
                    trabajador: int | None = Query(None),
                    _=Depends(sesion)):
    """La misma tabla que se ve en pantalla, en Excel."""
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta,
                 cat_lote_id, supervisor, trabajador)
    _exigir_fecha(f)

    filas = repo.listar(f, 50000)
    if not filas:
        raise HTTPException(404, "No hay registros para esos filtros.")

    nota = ("Supervisión de cosecha en vagón\n"
            f"Fecha del evento: {fecha_desde or 'sin límite'} a {fecha_hasta or 'sin límite'}\n"
            f"Fecha de actualización: {actualiza_desde or 'sin límite'} "
            f"a {actualiza_hasta or 'sin límite'}\n"
            f"Registros: {len(filas)}\n"
            "El filtro de trabajador incluye los registros donde la persona "
            "aparece acompañada.")

    contenido = _excel("vagon", COLUMNAS, filas, nota)
    archivo = _nombre("supervision_vagon",
                      fecha_desde or actualiza_desde, fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})
