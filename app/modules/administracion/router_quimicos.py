"""
PalmaData · Administración · Tratamientos · Químicos · Endpoints
================================================================
Rutas bajo /api/administracion/quimicos. Todas exigen sesión.
"""
from fastapi import APIRouter, Body, Depends, HTTPException

from . import repository_quimicos as repo
from .router import _fila, _quien, sesion

router_quimicos = APIRouter(prefix="/quimicos", tags=["administracion-quimicos"])


def _llamar(fn, *args):
    """Convierte el RAISE EXCEPTION de la base en un 400 legible."""
    try:
        return fn(*args)
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])


@router_quimicos.get("")
def get_todo(_=Depends(sesion)):
    """Las dos tablas de una vez: la pantalla las muestra juntas."""
    return {"ok": True,
            "categorias": [_fila(x) for x in repo.categorias()],
            "productos": [_fila(x) for x in repo.productos()]}


@router_quimicos.post("/categorias")
def post_categoria(datos: dict = Body(...), usuario=Depends(sesion)):
    nombre = (datos.get("categoria") or "").strip()
    if not nombre:
        raise HTTPException(400, "El nombre de la categoría es obligatorio.")
    return {"ok": True, "id": _llamar(repo.categoria_crear, nombre, _quien(usuario))}


@router_quimicos.post("/categorias/desactivar")
def post_categoria_desactivar(datos: dict = Body(...), usuario=Depends(sesion)):
    id_ = datos.get("id")
    if not id_:
        raise HTTPException(400, "Falta la categoría.")
    return {"ok": True, "n": _llamar(repo.categoria_desactivar, int(id_), _quien(usuario))}


@router_quimicos.post("/categorias/reactivar")
def post_categoria_reactivar(datos: dict = Body(...), usuario=Depends(sesion)):
    id_ = datos.get("id")
    if not id_:
        raise HTTPException(400, "Falta la categoría.")
    return {"ok": True, "n": _llamar(repo.categoria_reactivar, int(id_), _quien(usuario))}


@router_quimicos.post("/productos")
def post_producto(datos: dict = Body(...), usuario=Depends(sesion)):
    nombre = (datos.get("producto") or "").strip()
    cat = datos.get("categoria_producto_id")
    if not nombre:
        raise HTTPException(400, "El nombre del producto es obligatorio.")
    if not cat:
        raise HTTPException(400, "Elige la categoría del producto.")
    return {"ok": True, "id": _llamar(repo.producto_crear, nombre, int(cat), _quien(usuario))}


@router_quimicos.post("/productos/desactivar")
def post_producto_desactivar(datos: dict = Body(...), usuario=Depends(sesion)):
    id_ = datos.get("id")
    if not id_:
        raise HTTPException(400, "Falta el producto.")
    return {"ok": True, "n": _llamar(repo.producto_desactivar, int(id_), _quien(usuario))}


@router_quimicos.post("/productos/reactivar")
def post_producto_reactivar(datos: dict = Body(...), usuario=Depends(sesion)):
    id_ = datos.get("id")
    if not id_:
        raise HTTPException(400, "Falta el producto.")
    return {"ok": True, "n": _llamar(repo.producto_reactivar, int(id_), _quien(usuario))}
