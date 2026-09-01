"""
PalmaData · Sanidad · Trampas · Endpoints
=========================================
Rutas bajo /api/sanidad/trampas. Todas exigen sesión.

Sin erróneos ni duplicados. Filtro adicional por trampa. Corrección solo
unitaria (no hay /corregir-lote: el lote se deriva de la trampa).
"""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response

from . import repository_trampas as repo
from .router import (XLSX, _excel, _exigir_fecha, _fila, _ids, _limpiar,
                     _nombre, _quien, sesion)

# Prefijo RELATIVO: se monta dentro del router de sanidad (/api/sanidad).
router_trampas = APIRouter(prefix="/trampas", tags=["sanidad-trampas"])

# Opciones de los dos desplegables del modal, tal como se guardan.
OPCIONES_FEROMONA = ["si", "no"]
OPCIONES_ATRAYENTE = [0, 1]


def _filtros(fecha_desde=None, fecha_hasta=None, actualiza_desde=None,
             actualiza_hasta=None, cat_lote_id=None, evaluador=None,
             santrampaid=None) -> dict:
    # Los del censo más la trampa.
    return {"fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta,
            "actualiza_desde": actualiza_desde, "actualiza_hasta": actualiza_hasta,
            "cat_lote_id": cat_lote_id, "evaluador": evaluador,
            "santrampaid": santrampaid}


# ============================================================
#  CATÁLOGOS
# ============================================================

@router_trampas.get("/catalogos")
def get_catalogos(_=Depends(sesion)):
    return {"ok": True,
            "evaluadores": [_fila(x) for x in repo.listar_evaluadores()],
            "fechas": [_fila(x) for x in repo.fechas_disponibles()],
            "actualizaciones": [_fila(x) for x in repo.fechas_actualizacion()],
            "feromona": OPCIONES_FEROMONA,
            "atrayente": OPCIONES_ATRAYENTE}


@router_trampas.get("/lotes")
def get_lotes(q: str | None = Query(None), limite: int = Query(500, ge=1, le=2000),
              _=Depends(sesion)):
    return {"ok": True, "lotes": repo.listar_lotes(q, limite)}


@router_trampas.get("/trampas")
def get_trampas(q: str | None = Query(None, description="Código de la trampa"),
                limite: int = Query(500, ge=1, le=2000), _=Depends(sesion)):
    """Trampas por código, con su lote. Para el filtro y el modal."""
    return {"ok": True, "trampas": repo.listar_trampas(q, limite)}


# ============================================================
#  REVISIÓN
# ============================================================

@router_trampas.get("/revision")
def get_revision(fecha_desde: date | None = Query(None),
                 fecha_hasta: date | None = Query(None),
                 actualiza_desde: date | None = Query(None),
                 actualiza_hasta: date | None = Query(None),
                 cat_lote_id: int | None = Query(None),
                 evaluador: int | None = Query(None),
                 santrampaid: int | None = Query(None),
                 ver_anulados: bool = Query(False),
                 limite: int = Query(1000, ge=1, le=10000),
                 _=Depends(sesion)):
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta,
                 cat_lote_id, evaluador, santrampaid)
    _exigir_fecha(f)

    filas = repo.revision(f, ver_anulados, limite)
    return {"ok": True, "filtros": {k: _limpiar(v) for k, v in f.items()},
            "total": len(filas), "limite": limite,
            "truncado": len(filas) >= limite,
            "resumen": _fila(repo.resumen(f)),
            "registros": [_fila(x) for x in filas]}


# ============================================================
#  CORRECCIONES
# ============================================================

CAMPOS_EDITABLES = ("santrampaid", "hembras", "machos", "observaciones",
                    "feromona", "atrayente")


@router_trampas.post("/corregir")
def post_corregir(datos: dict = Body(...), usuario=Depends(sesion)):
    """
    Corrige UN registro: trampa (y con ella el lote), hembras, machos,
    observaciones, cambio de feromona y cambio de atrayente. Lectura,
    fecha, hora, evaluador y sin lectura no se editan.
    """
    id_registro = datos.get("id")
    if not id_registro:
        raise HTTPException(400, "Falta el registro a corregir.")

    campos = {k: datos.get(k) for k in CAMPOS_EDITABLES}
    if all(v in (None, "") for v in campos.values()):
        raise HTTPException(400, "No se envió ningún cambio.")
    campos = {k: (None if v in (None, "") else v) for k, v in campos.items()}

    if campos["feromona"] is not None \
            and str(campos["feromona"]).strip().lower() not in OPCIONES_FEROMONA:
        raise HTTPException(400, "Cambio de feromona debe ser «si» o «no».")
    if campos["atrayente"] is not None and int(campos["atrayente"]) not in OPCIONES_ATRAYENTE:
        raise HTTPException(400, "Cambio de atrayente debe ser 0 o 1.")

    try:
        n = repo.corregir_registro(int(id_registro), _quien(usuario), campos)
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


@router_trampas.post("/anular")
def post_anular(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    try:
        n = repo.anular(ids, _quien(usuario), datos.get("motivo"))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "anulados": n}


@router_trampas.post("/reactivar")
def post_reactivar(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    try:
        n = repo.reactivar(ids, _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "reactivados": n}


# ============================================================
#  DESCARGAS
# ============================================================

COLUMNAS_CONSOLIDADO = [
    ("lectura", "LECTURA"), ("fecha", "FECHA"), ("hora", "HORA"),
    ("trampa", "TRAMPA"), ("lote", "LOTE"),
    ("hembras", "HEMBRAS"), ("machos", "MACHOS"),
    ("evaluador", "EVALUADOR"), ("nolectura", "SIN LECTURA"),
    ("observaciones", "OBSERVACIONES"),
    ("feromona", "CAMBIO FEROMONA"), ("atrayente", "CAMBIO ATRAYENTE"),
]


def _exigir_fecha_descarga(fd, fh, ad, ah):
    if not any([fd, fh, ad, ah]):
        raise HTTPException(400, "Selecciona un rango de fechas: por fecha "
                                 "del evento o por fecha de actualización.")


@router_trampas.get("/consolidado")
def get_consolidado(fecha_desde: date | None = Query(None),
                    fecha_hasta: date | None = Query(None),
                    actualiza_desde: date | None = Query(None),
                    actualiza_hasta: date | None = Query(None),
                    _=Depends(sesion)):
    _exigir_fecha_descarga(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    filas = repo.consolidado(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    return {"ok": True, "total": len(filas),
            "columnas": [e for _c, e in COLUMNAS_CONSOLIDADO],
            "registros": [_fila(x) for x in filas[:500]]}


@router_trampas.get("/consolidado/excel")
def get_consolidado_excel(fecha_desde: date | None = Query(None),
                          fecha_hasta: date | None = Query(None),
                          actualiza_desde: date | None = Query(None),
                          actualiza_hasta: date | None = Query(None),
                          _=Depends(sesion)):
    _exigir_fecha_descarga(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    filas = repo.consolidado(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    if not filas:
        raise HTTPException(404, "No hay registros para esas fechas.")

    nota = ("Consolidado de trampas\n"
            f"Fecha del evento: {fecha_desde or 'sin límite'} a {fecha_hasta or 'sin límite'}\n"
            f"Fecha de actualización: {actualiza_desde or 'sin límite'} "
            f"a {actualiza_hasta or 'sin límite'}\n"
            f"Registros: {len(filas)}\n"
            "No incluye los anulados.")

    contenido = _excel("consolidado", COLUMNAS_CONSOLIDADO, filas, nota)
    archivo = _nombre("trampas_consolidado",
                      fecha_desde or actualiza_desde, fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})


@router_trampas.get("/revision/excel")
def get_revision_excel(fecha_desde: date | None = Query(None),
                       fecha_hasta: date | None = Query(None),
                       actualiza_desde: date | None = Query(None),
                       actualiza_hasta: date | None = Query(None),
                       cat_lote_id: int | None = Query(None),
                       evaluador: int | None = Query(None),
                       santrampaid: int | None = Query(None),
                       ver_anulados: bool = Query(False),
                       _=Depends(sesion)):
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta,
                 cat_lote_id, evaluador, santrampaid)
    _exigir_fecha(f)

    filas = repo.revision(f, ver_anulados, 10000)
    columnas = [("lectura", "Lectura"), ("fecha", "Fecha"), ("hora", "Hora"),
                ("trampa", "Trampa"), ("lote", "Lote"),
                ("hembras", "Hembras"), ("machos", "Machos"), ("total", "Total"),
                ("trabajador", "Evaluador"), ("nolectura", "Sin lectura"),
                ("observaciones", "Observaciones"),
                ("feromona", "Cambio feromona"), ("atrayente", "Cambio atrayente"),
                ("fecha_actualizacion", "Fecha actualización"),
                ("corregido_por", "Corregido por"), ("corregido_at", "Corregido el"),
                ("anulado_por", "Anulado por"), ("id_unico", "ID_unico")]

    nota = ("Revisión de trampas\n"
            f"Fecha del evento: {fecha_desde or '—'} a {fecha_hasta or '—'}\n"
            f"Fecha de actualización: {actualiza_desde or '—'} a {actualiza_hasta or '—'}\n"
            + ("Solo anulados\n" if ver_anulados else "")
            + f"Registros: {len(filas)}")

    contenido = _excel("revision", columnas, filas, nota)
    archivo = _nombre("trampas_revision",
                      fecha_desde or actualiza_desde, fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})
