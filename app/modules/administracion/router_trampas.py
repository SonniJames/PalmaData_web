"""
PalmaData · Administración · Trampas · Endpoints
================================================
Rutas bajo /api/administracion/trampas. Todas exigen sesión.

Se monta dentro del router de administración, con prefijo RELATIVO.
"""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from . import repository_trampas as repo
from .router import _fila, _ids, _quien, sesion

router_trampas = APIRouter(prefix="/trampas", tags=["administracion-trampas"])


def _estado(valor) -> int | None:
    """
    En la web se elige Activa / Inactiva; en la tabla se guarda 1 / 0.
    Acepta las dos formas para que el front pueda mandar cualquiera.
    """
    if valor in (None, ""):
        return None
    if isinstance(valor, bool):
        return 1 if valor else 0
    texto = str(valor).strip().lower()
    if texto in ("1", "activa", "activo", "true"):
        return 1
    if texto in ("0", "inactiva", "inactivo", "false"):
        return 0
    raise HTTPException(400, "El estado debe ser Activa o Inactiva.")


def _coordenada(valor, cual: str) -> float | None:
    """
    Las coordenadas se escriben con PUNTO decimal. Si llega una coma se
    rechaza en vez de adivinar: en «1043210,5» la coma podría ser el
    decimal o el separador de miles, y quedaría la trampa a kilómetros de
    donde está.
    """
    if valor in (None, ""):
        return None
    texto = str(valor).strip()
    if "," in texto:
        raise HTTPException(400, f"La coordenada {cual} debe usar punto como "
                                 f"separador decimal, no coma. Recibido: «{texto}».")
    try:
        return float(texto)
    except ValueError:
        raise HTTPException(400, f"La coordenada {cual} no es un número válido: «{texto}».")


# ============================================================
#  LISTADO Y CATÁLOGOS
# ============================================================

@router_trampas.get("")
def get_trampas(q: str | None = Query(None, description="Código de la trampa"),
                cat_lote_id: int | None = Query(None),
                ver_anuladas: bool = Query(False),
                limite: int = Query(2000, ge=1, le=10000),
                _=Depends(sesion)):
    """La tabla de trampas. Es una maestra: no hace falta filtro de fechas."""
    filas = repo.listar(q, cat_lote_id, ver_anuladas, limite)
    return {"ok": True, "total": len(filas), "limite": limite,
            "truncado": len(filas) >= limite,
            "resumen": _fila(repo.resumen()),
            "registros": [_fila(x) for x in filas]}


@router_trampas.get("/buscar")
def get_buscar(q: str = Query(..., min_length=1), _=Depends(sesion)):
    """Sugerencias del buscador por código."""
    return {"ok": True, "trampas": [_fila(x) for x in repo.buscar_codigos(q)]}


@router_trampas.get("/lotes")
def get_lotes(q: str | None = Query(None), limite: int = Query(500, ge=1, le=2000),
              _=Depends(sesion)):
    return {"ok": True, "lotes": repo.listar_lotes(q, limite)}


# ============================================================
#  ALTA, CORRECCIÓN Y BAJA
# ============================================================

@router_trampas.post("")
def post_crear(datos: dict = Body(...), usuario=Depends(sesion)):
    """
    Crea una trampa. santipotrampa = 1, catplantacionid = 2040074 y zona
    NULL se ponen en la base. geom la calcula el trigger desde x/y, por eso
    las dos coordenadas son obligatorias.
    """
    codigo = (datos.get("codigo") or "").strip()
    if not codigo:
        raise HTTPException(400, "El código es obligatorio.")

    estado = _estado(datos.get("estado"))
    if estado is None:
        raise HTTPException(400, "Indica si la trampa está Activa o Inactiva.")

    x = _coordenada(datos.get("x"), "x")
    y = _coordenada(datos.get("y"), "y")
    if x is None or y is None:
        raise HTTPException(400, "Las coordenadas x e y son obligatorias.")

    lote = datos.get("cat_lote_id")
    try:
        nueva = repo.crear(codigo, datos.get("instalacion") or None, x, y,
                           estado, int(lote) if lote else None, _quien(usuario))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "santrampaid": nueva}


@router_trampas.post("/corregir")
def post_corregir(datos: dict = Body(...), usuario=Depends(sesion)):
    """Corrige los mismos campos que se ingresan. Lo que no se envía queda igual."""
    id_trampa = datos.get("id")
    if not id_trampa:
        raise HTTPException(400, "Falta la trampa a corregir.")

    lote = datos.get("cat_lote_id")
    campos = {
        "codigo": (datos.get("codigo") or "").strip() or None,
        "instalacion": datos.get("instalacion") or None,
        "x": _coordenada(datos.get("x"), "x"),
        "y": _coordenada(datos.get("y"), "y"),
        "estado": _estado(datos.get("estado")),
        "cat_lote_id": int(lote) if lote else None,
    }
    if all(v is None for v in campos.values()):
        raise HTTPException(400, "No se envió ningún cambio.")

    if (campos["x"] is None) != (campos["y"] is None):
        raise HTTPException(400, "Para mover la trampa hay que enviar las dos "
                                 "coordenadas, x e y.")

    try:
        n = repo.corregir(int(id_trampa), _quien(usuario), campos)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


@router_trampas.post("/anular")
def post_anular(datos: dict = Body(...), usuario=Depends(sesion)):
    """Baja: pone estado = 0. No borra, para no romper las lecturas."""
    ids = _ids(datos)
    try:
        n = repo.anular(ids, _quien(usuario), datos.get("motivo"))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "anuladas": n}


@router_trampas.post("/reactivar")
def post_reactivar(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    try:
        n = repo.reactivar(ids, _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "reactivadas": n}
