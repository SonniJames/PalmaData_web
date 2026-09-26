"""
PalmaData · Administración · Permisos · Endpoints
==================================================
Rutas bajo /api/administracion/permisos.

Estos endpoints los protege el mismo middleware que el resto: solo entra
quien tenga permiso sobre `administracion`. Y una salvaguarda más: nadie
puede quitarse a sí mismo el acceso a este apartado, para no dejar la web
sin llave por accidente.
"""
from fastapi import APIRouter, Body, Depends, HTTPException

from ...core import security
from ...core.modules_registry import MODULOS
from . import repository_permisos as repo
from .router import _fila, _quien, sesion

router_permisos = APIRouter(prefix="/permisos", tags=["administracion-permisos"])


def admin_permisos(usuario=Depends(sesion)):
    """
    Exige el apartado `permisos`, no solo el módulo Administración.

    El control general del servidor es por módulo, y para casi todo alcanza.
    Aquí no: quien tuviera Administración → Trampas podría llamar estas
    rutas a mano y darse los permisos que quisiera. Esta es la pantalla que
    manda sobre las demás, así que se comprueba el apartado exacto.
    """
    if not security.puede(_quien(usuario), "administracion", "permisos"):
        raise HTTPException(403, "Necesitas el apartado Usuarios y permisos "
                                 "para ver o cambiar los accesos.")
    return usuario


@router_permisos.get("")
def get_todo(_=Depends(admin_permisos)):
    """Usuarios, permisos y el catálogo de módulos para los desplegables."""
    catalogo = [{"id": m["id"], "nombre": m["nombre"],
                 "submodulos": [{"id": s["id"], "nombre": s["nombre"]}
                                for s in m.get("submodulos", [])]}
                for m in MODULOS if m["id"] != "inicio"]
    return {"ok": True,
            "modo_abierto": repo.modo_abierto(),
            "usuarios": [_fila(x) for x in repo.usuarios()],
            "permisos": [_fila(x) for x in repo.todos()],
            "catalogo": catalogo}


@router_permisos.post("/otorgar")
def post_otorgar(datos: dict = Body(...), usuario=Depends(admin_permisos)):
    destino = (datos.get("usuario") or "").strip()
    modulo = (datos.get("modulo") or "").strip()
    apartado = (datos.get("apartado") or "").strip() or None
    if not destino or not modulo:
        raise HTTPException(400, "Falta el usuario o el módulo.")
    try:
        n = repo.otorgar(destino, modulo, apartado, _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    security.limpiar_cache(destino)
    return {"ok": True, "id": n}


@router_permisos.post("/quitar")
def post_quitar(datos: dict = Body(...), usuario=Depends(admin_permisos)):
    destino = (datos.get("usuario") or "").strip()
    modulo = (datos.get("modulo") or "").strip()
    apartado = (datos.get("apartado") or "").strip() or None
    if not destino or not modulo:
        raise HTTPException(400, "Falta el usuario o el módulo.")

    # Quitarse el propio acceso a este apartado deja la sesión sin poder
    # volver a entrar: se bloquea aquí, antes de tocar la base.
    yo = _quien(usuario)
    if destino == yo and modulo == "administracion" and apartado in (None, "permisos"):
        raise HTTPException(400, "No puedes quitarte tu propio acceso a Permisos. "
                                 "Pídeselo a otro administrador.")
    try:
        n = repo.quitar(destino, modulo, apartado)
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    security.limpiar_cache(destino)
    return {"ok": True, "quitados": n}
