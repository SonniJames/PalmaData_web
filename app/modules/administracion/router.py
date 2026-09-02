"""
PalmaData · Administración · Endpoints
======================================
Rutas bajo /api/administracion. Todas exigen sesión.

Primer apartado: Personal (tabla maestra aux_trabajador). Sin descargas:
es una sola pantalla con alta, corrección, baja y reactivación.

Los ayudantes de sesión y limpieza están copiados a propósito: cada
módulo es aislado y debe poder arrancar sin los demás.
"""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request

from ...core import security
from . import repository as repo

router = APIRouter(prefix="/api/administracion", tags=["administracion"])


def sesion(request: Request) -> dict:
    usuario = security.usuario_actual(request)
    if not usuario:
        raise HTTPException(401, "Sesión no iniciada.")
    return usuario


def _quien(usuario: dict) -> str:
    """
    El username que queda registrado. Va en texto a propósito: la columna
    `usuario` de la tabla es un entero de otro sistema y se deja en NULL,
    como quedó definido.
    """
    return usuario["usuario"]


def _limpiar(v):
    if isinstance(v, date):
        return v.isoformat()
    if hasattr(v, "quantize"):
        return float(v)
    if hasattr(v, "strftime"):
        return v.strftime("%H:%M:%S")
    return v


def _fila(f: dict) -> dict:
    return {k: _limpiar(v) for k, v in f.items()}


def _ids(datos: dict) -> list[int]:
    ids = datos.get("ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(400, "No se seleccionó ningún trabajador.")
    try:
        return [int(x) for x in ids]
    except (TypeError, ValueError):
        raise HTTPException(400, "Hay identificadores inválidos.")


def _supervisor(valor) -> int | None:
    """
    En la web se elige Sí / No; en la tabla se guarda 1 / 0. Acepta las dos
    formas para que el front pueda mandar cualquiera sin ambigüedad.
    """
    if valor in (None, ""):
        return None
    if isinstance(valor, bool):
        return 1 if valor else 0
    texto = str(valor).strip().lower()
    if texto in ("1", "si", "sí", "true"):
        return 1
    if texto in ("0", "no", "false"):
        return 0
    raise HTTPException(400, "Supervisor debe ser Sí o No.")


# ============================================================
#  PERSONAL · listado
# ============================================================

@router.get("/personal")
def get_personal(q: str | None = Query(None, description="Nombre o documento"),
                 ver_anulados: bool = Query(False),
                 solo_supervisores: bool = Query(False),
                 limite: int = Query(2000, ge=1, le=10000),
                 _=Depends(sesion)):
    """
    La tabla de trabajadores. A diferencia de los módulos de registro, aquí
    no hace falta filtro de fechas: es una maestra, no un histórico.
    """
    filas = repo.listar(q, ver_anulados, solo_supervisores, limite)
    return {"ok": True, "total": len(filas), "limite": limite,
            "truncado": len(filas) >= limite,
            "resumen": _fila(repo.resumen()),
            "registros": [_fila(x) for x in filas]}


@router.get("/personal/buscar")
def get_buscar(q: str = Query(..., min_length=1), _=Depends(sesion)):
    """Sugerencias para el buscador por nombre."""
    return {"ok": True, "trabajadores": [_fila(x) for x in repo.buscar_nombres(q)]}


# ============================================================
#  PERSONAL · alta, corrección y baja
# ============================================================

@router.post("/personal")
def post_crear(datos: dict = Body(...), usuario=Depends(sesion)):
    """
    Crea un trabajador. Solo se piden nombre, documento, supervisor y
    Código SIP (la columna `sucursal`); el resto de columnas quedan como
    se definió: NULL, salvo codigo_movil = '0', cuadrilla = 0, funcion = 0.
    """
    nombre = (datos.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(400, "El nombre es obligatorio.")

    supervisor = _supervisor(datos.get("supervisor"))
    if supervisor is None:
        raise HTTPException(400, "Indica si el trabajador es supervisor.")

    try:
        nuevo = repo.crear(nombre, (datos.get("documento") or "").strip() or None,
                           supervisor, (datos.get("sucursal") or "").strip() or None,
                           _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "aux_trabajador_id": nuevo}


@router.post("/personal/corregir")
def post_corregir(datos: dict = Body(...), usuario=Depends(sesion)):
    """Corrige los mismos campos que se ingresan al crear."""
    id_trabajador = datos.get("id")
    if not id_trabajador:
        raise HTTPException(400, "Falta el trabajador a corregir.")

    campos = {
        "nombre": (datos.get("nombre") or "").strip() or None,
        "documento": (datos.get("documento") or "").strip() or None,
        "supervisor": _supervisor(datos.get("supervisor")),
        "sucursal": (datos.get("sucursal") or "").strip() or None,
    }
    if all(v is None for v in campos.values()):
        raise HTTPException(400, "No se envió ningún cambio.")

    try:
        n = repo.corregir(int(id_trabajador), _quien(usuario), campos)
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


@router.post("/personal/anular")
def post_anular(datos: dict = Body(...), usuario=Depends(sesion)):
    """Baja: pone estado = 0. No borra, para no romper los registros de campo."""
    ids = _ids(datos)
    try:
        n = repo.anular(ids, _quien(usuario), datos.get("motivo"))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "anulados": n}


@router.post("/personal/reactivar")
def post_reactivar(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    try:
        n = repo.reactivar(ids, _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "reactivados": n}
