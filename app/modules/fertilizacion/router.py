"""
PalmaData · Fertilización · Endpoints
=====================================
Rutas bajo /api/fertilizacion. Todas exigen sesión.
El router no tiene SQL (está en repository) ni aritmética (está en calc).
"""
from fastapi import (APIRouter, Body, Depends, File, Form, HTTPException,
                     Query, Request, UploadFile)
from fastapi.responses import Response

from ...core import db, security
from . import repository as repo
from .calc import (comparar_campanas, consolidar, preparar_lote,
                   resumen_nutricional)
from .columnas import ETIQUETA_NUTRIENTE, NUTRIENTES, PRODUCTOS
from .excel_loader import generar_formato, leer_excel
from .params import CAMPOS, ETIQUETAS, get_default_params

router = APIRouter(prefix="/api/fertilizacion", tags=["fertilizacion"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def sesion(request: Request) -> dict:
    usuario = security.usuario_actual(request)
    if not usuario:
        raise HTTPException(401, "Sesión no iniciada.")
    return usuario


def _limpiar(valor):
    """Decimal de Postgres -> float, para JSON limpio."""
    if hasattr(valor, "quantize"):
        return float(valor)
    if isinstance(valor, dict):
        return {k: _limpiar(v) for k, v in valor.items()}
    return valor


def _lotes_preparados(anio: int, zona=None, rango_edad=None):
    filas = repo.listar_lotes(anio, zona, rango_edad)
    params = repo.parametros_o_default(anio)
    lotes = [preparar_lote({k: _limpiar(v) for k, v in f.items()}, params)
             for f in filas]
    return lotes, params


# ============================================================
#  CAMPAÑAS
# ============================================================

@router.get("/campanas")
def get_campanas(_=Depends(sesion)):
    return {"ok": True, "campanas": repo.listar_campanas()}


@router.post("/campanas")
def post_campana(datos: dict = Body(...), usuario=Depends(sesion)):
    anio = datos.get("anio")
    if not anio:
        raise HTTPException(400, "Falta el año.")
    if repo.campana_por_anio(int(anio)):
        raise HTTPException(400, f"La campaña {anio} ya existe.")
    with db.get_cursor() as cur:
        cid = repo.crear_campana(cur, int(anio), datos.get("nombre"),
                                 usuario=usuario["usuario"],
                                 copiar_de=datos.get("copiar_de"))
    return {"ok": True, "id": cid, "anio": int(anio)}


@router.delete("/campanas/{anio}")
def delete_campana(anio: int, _=Depends(sesion)):
    if not repo.eliminar_campana(anio):
        raise HTTPException(404, f"No existe la campaña {anio}.")
    return {"ok": True}


@router.put("/campanas/{anio}/estado")
def put_estado(anio: int, datos: dict = Body(...), _=Depends(sesion)):
    if not repo.cerrar_campana(anio, bool(datos.get("cerrada"))):
        raise HTTPException(404, f"No existe la campaña {anio}.")
    return {"ok": True}


# ============================================================
#  PARÁMETROS
# ============================================================

@router.get("/parametros/default")
def get_default(_=Depends(sesion)):
    return {"ok": True, "params": get_default_params(),
            "etiquetas": ETIQUETAS, "campos": CAMPOS}


@router.get("/parametros/{anio}")
def get_parametros(anio: int, _=Depends(sesion)):
    p = repo.obtener_parametros(anio)
    if p is None:
        raise HTTPException(404, f"No hay parámetros para {anio}.")
    return {"ok": True, "params": p, "etiquetas": ETIQUETAS, "campos": CAMPOS}


@router.put("/parametros/{anio}")
def put_parametros(anio: int, params: dict = Body(...), _=Depends(sesion)):
    if not repo.guardar_parametros(anio, params):
        raise HTTPException(404, f"No existe la campaña {anio}.")
    return {"ok": True, "anio": anio}


# ============================================================
#  CARGA
# ============================================================

@router.get("/formato")
def get_formato(_=Depends(sesion)):
    """Descarga el Excel de formato, con la estructura A–ED en blanco."""
    return Response(
        content=generar_formato(), media_type=XLSX,
        headers={"Content-Disposition":
                 'attachment; filename="formato_fertilizacion.xlsx"'})


@router.post("/carga")
async def post_carga(
    anio: int = Form(...),
    archivo: UploadFile = File(...),
    reemplazar: bool = Form(False),
    usuario=Depends(sesion),
):
    """
    Sube el Excel completo de una campaña.
    reemplazar=True borra los lotes existentes del año antes de cargar.
    """
    if not archivo.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "El archivo debe ser .xlsx")

    lotes, advertencias = leer_excel(await archivo.read())
    if not lotes:
        raise HTTPException(400, {"mensaje": "No se cargó nada.",
                                  "advertencias": advertencias})

    nuevos = actualizados = borrados = 0
    with db.get_cursor() as cur:
        campana_id = repo.obtener_o_crear_campana(
            cur, anio, archivo.filename, usuario["usuario"])

        if reemplazar:
            borrados = repo.borrar_lotes_de_campana(cur, campana_id)

        for registro in lotes:
            if repo.guardar_lote(cur, campana_id, registro):
                nuevos += 1
            else:
                actualizados += 1

    return {"ok": True, "anio": anio, "archivo": archivo.filename,
            "lotes_leidos": len(lotes), "nuevos": nuevos,
            "actualizados": actualizados, "borrados": borrados,
            "advertencias": advertencias}


# ============================================================
#  LOTES
# ============================================================

@router.get("/lotes")
def get_lotes(anio: int = Query(...), zona: str | None = Query(None),
              rango_edad: str | None = Query(None), _=Depends(sesion)):
    lotes, _p = _lotes_preparados(anio, zona, rango_edad)
    filtros = repo.filtros_de_campana(anio)
    return {"ok": True, "anio": anio, "total": len(lotes),
            "lotes": lotes, **filtros}


@router.get("/lotes/{lote_id}")
def get_lote(lote_id: int, anio: int = Query(...), _=Depends(sesion)):
    fila = repo.obtener_lote(lote_id)
    if not fila:
        raise HTTPException(404, "Lote no encontrado.")
    params = repo.parametros_o_default(anio)
    return {"ok": True,
            "lote": preparar_lote({k: _limpiar(v) for k, v in fila.items()}, params)}


@router.put("/lotes/{lote_id}")
def put_lote(lote_id: int, datos: dict = Body(...), _=Depends(sesion)):
    if not repo.actualizar_base(lote_id, datos):
        raise HTTPException(404, "Lote no encontrado o sin campos válidos.")
    return {"ok": True, "id": lote_id}


@router.delete("/lotes/{lote_id}")
def delete_lote(lote_id: int, _=Depends(sesion)):
    if not repo.eliminar_lote(lote_id):
        raise HTTPException(404, "Lote no encontrado.")
    return {"ok": True}


# ============================================================
#  CONSOLIDADO E INDICADORES
# ============================================================

@router.get("/consolidado")
def get_consolidado(anio: int = Query(...),
                    por: str = Query("zona", pattern="^(zona|rango_edad|material)$"),
                    _=Depends(sesion)):
    lotes, params = _lotes_preparados(anio)
    if not lotes:
        return {"ok": True, "anio": anio, "grupos": [], "total": {}}
    r = consolidar(lotes, por, params)
    return {"ok": True, "anio": anio, "agrupado_por": por, **r,
            "productos": [{"clave": c, "nombre": n} for _, c, n in PRODUCTOS]}


@router.get("/dashboard")
def get_dashboard(anio: int = Query(...), _=Depends(sesion)):
    """Todo lo que necesita la pantalla de indicadores, en una sola llamada."""
    lotes, params = _lotes_preparados(anio)
    if not lotes:
        return {"ok": True, "anio": anio, "vacio": True}

    por_zona = consolidar(lotes, "zona", params)
    por_edad = consolidar(lotes, "rango_edad", params)
    nutricion = resumen_nutricional(lotes, params)

    productos = [{"clave": c, "nombre": n,
                  "toneladas": por_zona["total"].get(c, 0),
                  "costo": por_zona["total"].get(c, 0) *
                           params["precios"].get(c, 0)}
                 for _, c, n in PRODUCTOS]

    top = sorted(lotes, key=lambda l: l["costos"]["costo_total"], reverse=True)[:10]

    return {
        "ok": True, "anio": anio, "vacio": False,
        "total": por_zona["total"],
        "por_zona": por_zona["grupos"],
        "por_edad": por_edad["grupos"],
        "nutricion": nutricion,
        "productos": productos,
        "top_lotes": [{"identificacion": l["identificacion"], "zona": l["zona"],
                       "palmas": l["palmas"],
                       "toneladas": l["costos"]["toneladas"],
                       "costo": l["costos"]["costo_total"]} for l in top],
        "nutrientes": [{"clave": n, "nombre": ETIQUETA_NUTRIENTE[n]}
                       for n in NUTRIENTES],
    }


@router.get("/comparativo")
def get_comparativo(anios: str = Query(..., description="Ej: 2024,2025"),
                    _=Depends(sesion)):
    datos = {}
    for texto in anios.split(","):
        texto = texto.strip()
        if not texto.isdigit():
            continue
        anio = int(texto)
        lotes, params = _lotes_preparados(anio)
        if lotes:
            datos[anio] = consolidar(lotes, "zona", params)
    return {"ok": True, "campanas": comparar_campanas(datos),
            "productos": [{"clave": c, "nombre": n} for _, c, n in PRODUCTOS]}
