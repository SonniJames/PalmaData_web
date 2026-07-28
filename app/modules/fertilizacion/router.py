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
from .calc import comparar_campanas, consolidar, preparar_lote, resumen_nutricional
from .excel_loader import generar_formato, leer_excel
from .formato import HOJAS_DATOS, ordenar_nutrientes
from .params import CAMPOS, ETIQUETAS, asegurar_precios, get_default_params

router = APIRouter(prefix="/api/fertilizacion", tags=["fertilizacion"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def sesion(request: Request) -> dict:
    usuario = security.usuario_actual(request)
    if not usuario:
        raise HTTPException(401, "Sesión no iniciada.")
    return usuario


def _limpiar(v):
    """Decimal de Postgres -> float, para JSON limpio."""
    if hasattr(v, "quantize"):
        return float(v)
    if isinstance(v, dict):
        return {k: _limpiar(x) for k, x in v.items()}
    return v


def _cargar(anio: int, zona=None, sector=None, rango_edad=None):
    """Devuelve (lotes preparados, params, fertilizantes)."""
    filas = repo.listar_lotes(anio, zona, sector, rango_edad)
    params = repo.parametros_o_default(anio)
    lotes = [preparar_lote({k: _limpiar(v) for k, v in f.items()}, params)
             for f in filas]
    ferts = repo.fertilizantes_de_campana(anio)
    return lotes, params, ferts


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

@router.get("/parametros/{anio}")
def get_parametros(anio: int, _=Depends(sesion)):
    """
    Parámetros de la campaña. Los precios se completan con los
    fertilizantes que trajo el Excel de ESE año, así el formulario
    cambia según la campaña seleccionada.
    """
    p = repo.obtener_parametros(anio)
    if p is None:
        raise HTTPException(404, f"No hay parámetros para {anio}.")
    ferts = repo.fertilizantes_de_campana(anio)
    p = asegurar_precios(p, ferts)
    return {"ok": True, "params": p, "fertilizantes": ferts,
            "etiquetas": ETIQUETAS, "campos": CAMPOS}


@router.put("/parametros/{anio}")
def put_parametros(anio: int, params: dict = Body(...), _=Depends(sesion)):
    if not repo.guardar_parametros(anio, params):
        raise HTTPException(404, f"No existe la campaña {anio}.")
    return {"ok": True, "anio": anio}


@router.get("/parametros/default/valores")
def get_default(_=Depends(sesion)):
    return {"ok": True, "params": get_default_params(),
            "etiquetas": ETIQUETAS, "campos": CAMPOS}


# ============================================================
#  CARGA
# ============================================================

@router.get("/formato")
def get_formato(desde: int | None = Query(None,
                description="Año del que precargar las identificaciones"),
                _=Depends(sesion)):
    """Descarga el Excel de formato con sus cuatro hojas."""
    idents = repo.identificaciones_de_campana(desde) if desde else None
    ferts = repo.fertilizantes_de_campana(desde) if desde else None
    return Response(
        content=generar_formato(idents, ferts or None), media_type=XLSX,
        headers={"Content-Disposition":
                 'attachment; filename="formato_fertilizacion.xlsx"'})


@router.post("/carga")
async def post_carga(
    anio: int = Form(...),
    archivo: UploadFile = File(...),
    reemplazar: bool = Form(False),
    usuario=Depends(sesion),
):
    if not archivo.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "El archivo debe ser .xlsx")

    resultado, advertencias = leer_excel(await archivo.read())
    lotes = (resultado or {}).get("lotes") or []
    if not lotes:
        raise HTTPException(400, {"mensaje": "No se cargó nada.",
                                  "advertencias": advertencias})

    nuevos = actualizados = borrados = 0
    with db.get_cursor() as cur:
        campana_id = repo.obtener_o_crear_campana(
            cur, anio, archivo.filename, usuario["usuario"])

        if reemplazar:
            borrados = repo.borrar_lotes_de_campana(cur, campana_id)

        for reg in lotes:
            if repo.guardar_lote(cur, campana_id, reg):
                nuevos += 1
            else:
                actualizados += 1

        # Asegura que los fertilizantes nuevos tengan precio (en 0)
        ferts = sorted({f for l in lotes
                        for f in (l.get("bloques", {}).get("requerimiento") or {})})
        if ferts:
            cur.execute("""
                SELECT params FROM plantacion.fert_parametros WHERE campana_id=%s
            """, (campana_id,))
            fila = cur.fetchone()
            actuales = (fila or {}).get("params") or get_default_params()
            repo.guardar_parametros_cur(cur, campana_id,
                                        asegurar_precios(actuales, ferts))

    return {"ok": True, "anio": anio, "archivo": archivo.filename,
            "lotes_leidos": len(lotes), "nuevos": nuevos,
            "actualizados": actualizados, "borrados": borrados,
            "hojas": resultado.get("hojas_leidas", []),
            "columnas": resultado.get("columnas", {}),
            "advertencias": advertencias}


# ============================================================
#  LOTES Y DIAGNÓSTICO
# ============================================================

@router.get("/lotes")
def get_lotes(anio: int = Query(...), zona: str | None = Query(None),
              sector: str | None = Query(None),
              rango_edad: str | None = Query(None), _=Depends(sesion)):
    lotes, _p, ferts = _cargar(anio, zona, sector, rango_edad)
    nutrientes = ordenar_nutrientes(
        {k for l in lotes for k in (l.get("balance") or {})})
    return {"ok": True, "anio": anio, "total": len(lotes), "lotes": lotes,
            "fertilizantes": ferts, "nutrientes": nutrientes,
            **repo.filtros_de_campana(anio)}


@router.get("/diagnostico")
def get_diagnostico(anio: int = Query(...), zona: str | None = Query(None),
                    sector: str | None = Query(None),
                    rango_edad: str | None = Query(None), _=Depends(sesion)):
    """Análisis foliar del laboratorio, por lote y nutriente."""
    lotes, _p, _f = _cargar(anio, zona, sector, rango_edad)
    nutrientes = ordenar_nutrientes(
        {k for l in lotes for k in (l.get("foliar") or {})})
    salida = [{"id": l["id"], "identificacion": l["identificacion"],
               "uma": l.get("uma"), "zona": l.get("zona"),
               "sector": l.get("sector"), "rango_edad": l.get("rango_edad"),
               "palmas": l.get("palmas"), "mst": l.get("mst"),
               "foliar": l.get("foliar") or {}} for l in lotes]
    return {"ok": True, "anio": anio, "total": len(salida),
            "nutrientes": nutrientes, "lotes": salida,
            **repo.filtros_de_campana(anio)}


@router.get("/lotes/{lote_id}")
def get_lote(lote_id: int, anio: int = Query(...), _=Depends(sesion)):
    fila = repo.obtener_lote(lote_id)
    if not fila:
        raise HTTPException(404, "Lote no encontrado.")
    params = repo.parametros_o_default(anio)
    return {"ok": True, "lote": preparar_lote(
        {k: _limpiar(v) for k, v in fila.items()}, params)}


@router.put("/lotes/{lote_id}")
def put_lote(lote_id: int, datos: dict = Body(...), _=Depends(sesion)):
    if not repo.actualizar_lote(lote_id, datos):
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
                    por: str = Query("zona",
                        pattern="^(zona|sector|rango_edad|material)$"),
                    _=Depends(sesion)):
    lotes, params, ferts = _cargar(anio)
    if not lotes:
        return {"ok": True, "anio": anio, "grupos": [], "total": {}}
    r = consolidar(lotes, por, params, ferts)
    return {"ok": True, "anio": anio, "agrupado_por": por,
            "fertilizantes": ferts, **r}


@router.get("/dashboard")
def get_dashboard(anio: int = Query(...), _=Depends(sesion)):
    """Todo lo que necesita la pantalla de resumen, en una sola llamada."""
    lotes, params, ferts = _cargar(anio)
    if not lotes:
        return {"ok": True, "anio": anio, "vacio": True}

    por_zona = consolidar(lotes, "zona", params, ferts)
    por_sector = consolidar(lotes, "sector", params, ferts)
    por_edad = consolidar(lotes, "rango_edad", params, ferts)

    precios = params.get("precios", {})
    productos = [{"nombre": f,
                  "cantidad": por_zona["total"].get(f, 0),
                  "costo": por_zona["total"].get(f, 0) * (precios.get(f) or 0)}
                 for f in ferts]

    top = sorted(lotes, key=lambda l: l["costos"]["costo_total"], reverse=True)[:10]

    return {
        "ok": True, "anio": anio, "vacio": False,
        "total": por_zona["total"],
        "por_zona": por_zona["grupos"],
        "por_sector": por_sector["grupos"],
        "por_edad": por_edad["grupos"],
        "nutricion": resumen_nutricional(lotes, params),
        "productos": productos,
        "top_lotes": [{"identificacion": l["identificacion"],
                       "zona": l.get("zona"), "sector": l.get("sector"),
                       "palmas": l.get("palmas"),
                       "cantidad": l["costos"]["cantidad"],
                       "costo": l["costos"]["costo_total"]} for l in top],
        "sin_precio": [f for f in ferts if not precios.get(f)],
    }


@router.get("/comparativo")
def get_comparativo(anios: str = Query(..., description="Ej: 2025,2026"),
                    _=Depends(sesion)):
    datos, todos = {}, set()
    for texto in anios.split(","):
        texto = texto.strip()
        if not texto.isdigit():
            continue
        anio = int(texto)
        lotes, params, ferts = _cargar(anio)
        if lotes:
            datos[anio] = consolidar(lotes, "zona", params, ferts)
            todos.update(ferts)
    return {"ok": True, "campanas": comparar_campanas(datos),
            "fertilizantes": sorted(todos)}
