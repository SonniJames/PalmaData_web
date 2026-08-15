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
from .calc import (analisis_elementos, aplicaciones, comparar_campanas,
                   consolidar, preparar_lote, resumen_nutricional)
from .excel_loader import generar_formato, leer_excel
from .formato import HOJAS_DATOS, ordenar_nutrientes
from .params import (CAMPOS, ETIQUETAS, asegurar_precios, flete_de,
                     get_default_params)

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


def _empresa(empresa_id: int | None) -> int:
    """
    Resuelve la empresa. Si no viene, usa la primera activa, para que
    el módulo siga funcionando mientras el frontend no la envíe.
    """
    if empresa_id:
        return int(empresa_id)
    e = repo.empresa_por_defecto()
    if not e:
        raise HTTPException(400, "No hay empresas registradas. "
                                 "Ejecuta deploy/06_fert_empresas.sql")
    return e["id"]


def _resumen_bloque(lotes: list[dict], bloque: str) -> dict:
    """Totales de un bloque JSONB, para las tarjetas del Resumen."""
    r = analisis_elementos(lotes, bloque, top=5)
    if r.get("vacio"):
        return {"vacio": True}
    return {"vacio": False,
            "elementos": r["elementos"],
            "por_elemento": r["por_elemento"],
            "total": r["total"]["total"],
            "palmas": r["total"]["palmas"],
            "hectareas": r["total"]["hectareas"]}


def _cargar(empresa_id: int, anio: int, zona=None, sector=None,
            rango_edad=None, identificacion=None, uma=None):
    """Devuelve (lotes preparados, params, fertilizantes)."""
    filas = repo.listar_lotes(empresa_id, anio, zona, sector, rango_edad,
                              identificacion, uma)
    params = repo.parametros_o_default(empresa_id, anio)
    lotes = [preparar_lote({k: _limpiar(v) for k, v in f.items()}, params)
             for f in filas]
    ferts = repo.fertilizantes_de_campana(empresa_id, anio)
    return lotes, params, ferts


# ============================================================
#  EMPRESAS
# ============================================================

@router.get("/empresas")
def get_empresas(_=Depends(sesion)):
    return {"ok": True, "empresas": repo.listar_empresas()}


# ============================================================
#  CAMPAÑAS
# ============================================================

@router.get("/campanas")
def get_campanas(empresa_id: int | None = Query(None), _=Depends(sesion)):
    """Campañas. Sin empresa_id devuelve las de todas, con su empresa."""
    return {"ok": True, "campanas": repo.listar_campanas(empresa_id)}


@router.post("/campanas")
def post_campana(datos: dict = Body(...), usuario=Depends(sesion)):
    anio = datos.get("anio")
    if not anio:
        raise HTTPException(400, "Falta el año.")
    eid = _empresa(datos.get("empresa_id"))
    if repo.campana_por_anio(eid, int(anio)):
        raise HTTPException(400, f"La campaña {anio} ya existe para esa empresa.")
    with db.get_cursor() as cur:
        cid = repo.crear_campana(cur, eid, int(anio), datos.get("nombre"),
                                 usuario=usuario["usuario"],
                                 copiar_de=datos.get("copiar_de"))
    return {"ok": True, "id": cid, "anio": int(anio), "empresa_id": eid}


@router.delete("/campanas/{anio}")
def delete_campana(anio: int, empresa_id: int | None = Query(None),
                   _=Depends(sesion)):
    if not repo.eliminar_campana(_empresa(empresa_id), anio):
        raise HTTPException(404, f"No existe la campaña {anio} para esa empresa.")
    return {"ok": True}


@router.put("/campanas/{anio}/estado")
def put_estado(anio: int, datos: dict = Body(...), _=Depends(sesion)):
    if not repo.cerrar_campana(_empresa(datos.get("empresa_id")), anio,
                               bool(datos.get("cerrada"))):
        raise HTTPException(404, f"No existe la campaña {anio} para esa empresa.")
    return {"ok": True}


# ============================================================
#  PARÁMETROS
# ============================================================

@router.get("/parametros/{anio}")
def get_parametros(anio: int, empresa_id: int | None = Query(None),
                   _=Depends(sesion)):
    """
    Parámetros de la campaña. Los precios se completan con los
    fertilizantes que trajo el Excel de ESE año, así el formulario
    cambia según la campaña seleccionada.
    """
    eid = _empresa(empresa_id)
    p = repo.obtener_parametros(eid, anio)
    if p is None:
        raise HTTPException(404, f"No hay parámetros para {anio} en esa empresa.")
    ferts = repo.fertilizantes_de_campana(eid, anio)
    p = asegurar_precios(p, ferts)
    emp = repo.empresa_por_id(eid)
    return {"ok": True, "params": p, "fertilizantes": ferts,
            "empresa_id": eid, "empresa": emp["nombre"] if emp else None,
            "etiquetas": ETIQUETAS, "campos": CAMPOS}


@router.put("/parametros/{anio}")
def put_parametros(anio: int, cuerpo: dict = Body(...), _=Depends(sesion)):
    """Los parámetros son de una empresa y un año concretos."""
    eid = _empresa(cuerpo.pop("empresa_id", None))
    if not repo.guardar_parametros(eid, anio, cuerpo):
        raise HTTPException(404, f"No existe la campaña {anio} para esa empresa.")
    return {"ok": True, "anio": anio, "empresa_id": eid}


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
                empresa_id: int | None = Query(None),
                _=Depends(sesion)):
    """Descarga el Excel de formato con sus seis hojas de datos."""
    eid = _empresa(empresa_id)
    idents = repo.identificaciones_de_campana(eid, desde) if desde else None
    ferts = repo.fertilizantes_de_campana(eid, desde) if desde else None
    emp = repo.empresa_por_id(eid)
    return Response(
        content=generar_formato(idents, ferts or None,
                                emp["nombre"] if emp else None),
        media_type=XLSX,
        headers={"Content-Disposition":
                 'attachment; filename="formato_fertilizacion.xlsx"'})


@router.post("/carga")
async def post_carga(
    anio: int = Form(...),
    empresa_id: int = Form(...),
    archivo: UploadFile = File(...),
    reemplazar: bool = Form(True),
    usuario=Depends(sesion),
):
    """
    Carga el Excel de UNA empresa en UN año.

    Por defecto reemplaza: borra los lotes de esa empresa+año y carga
    los del archivo. Así, si te equivocaste de archivo, vuelves a subir
    el correcto y no quedan lotes viejos mezclados. Los parámetros
    (precios, fletes) NO se borran: viven en la campaña.
    """
    if not archivo.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "El archivo debe ser .xlsx")

    empresa = repo.empresa_por_id(empresa_id)
    if not empresa:
        raise HTTPException(400, "Selecciona una empresa válida antes de cargar.")

    resultado, advertencias = leer_excel(await archivo.read())
    lotes = (resultado or {}).get("lotes") or []
    if not lotes:
        raise HTTPException(400, {"mensaje": "No se cargó nada.",
                                  "advertencias": advertencias})

    # Si el Excel trae columna "empresa", se valida contra la seleccionada.
    # Es la red de seguridad contra subir el archivo equivocado.
    del_archivo = {(l.get("extra") or {}).get("empresa")
                   for l in lotes if (l.get("extra") or {}).get("empresa")}
    for nombre in del_archivo:
        if str(nombre).strip().lower() != empresa["nombre"].strip().lower():
            raise HTTPException(400, {
                "mensaje": f"El archivo dice que es de «{nombre}» pero "
                           f"seleccionaste «{empresa['nombre']}». "
                           f"Revisa antes de cargar.",
                "advertencias": advertencias})

    nuevos = actualizados = borrados = 0
    with db.get_cursor() as cur:
        campana_id = repo.obtener_o_crear_campana(
            cur, empresa_id, anio, archivo.filename, usuario["usuario"])

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
            "empresa_id": empresa_id, "empresa": empresa["nombre"],
            "lotes_leidos": len(lotes), "nuevos": nuevos,
            "actualizados": actualizados, "borrados": borrados,
            "hojas": resultado.get("hojas_leidas", []),
            "columnas": resultado.get("columnas", {}),
            "advertencias": advertencias}


# ============================================================
#  LOTES Y DIAGNÓSTICO
# ============================================================

@router.get("/lotes")
def get_lotes(anio: int = Query(...), empresa_id: int | None = Query(None),
              zona: str | None = Query(None), sector: str | None = Query(None),
              rango_edad: str | None = Query(None),
              identificacion: str | None = Query(None),
              uma: int | None = Query(None), _=Depends(sesion)):
    eid = _empresa(empresa_id)
    lotes, _p, ferts = _cargar(eid, anio, zona, sector, rango_edad,
                               identificacion, uma)
    nutrientes = ordenar_nutrientes(
        {k for l in lotes for k in (l.get("balance") or {})})
    return {"ok": True, "anio": anio, "empresa_id": eid,
            "total": len(lotes), "lotes": lotes,
            "fertilizantes": ferts, "nutrientes": nutrientes,
            **repo.filtros_de_campana(eid, anio)}


@router.get("/diagnostico")
def get_diagnostico(anio: int = Query(...), empresa_id: int | None = Query(None),
                    zona: str | None = Query(None),
                    sector: str | None = Query(None),
                    rango_edad: str | None = Query(None),
                    identificacion: str | None = Query(None),
                    uma: int | None = Query(None), _=Depends(sesion)):
    """Análisis foliar del laboratorio, por lote y nutriente."""
    eid = _empresa(empresa_id)
    lotes, _p, _f = _cargar(eid, anio, zona, sector, rango_edad,
                            identificacion, uma)
    nutrientes = ordenar_nutrientes(
        {k for l in lotes for k in (l.get("foliar") or {})})
    salida = [{"id": l["id"], "identificacion": l["identificacion"],
               "uma": l.get("uma"), "zona": l.get("zona"),
               "sector": l.get("sector"), "rango_edad": l.get("rango_edad"),
               "palmas": l.get("palmas"), "mst": l.get("mst"),
               "foliar": l.get("foliar") or {}} for l in lotes]
    return {"ok": True, "anio": anio, "empresa_id": eid, "total": len(salida),
            "nutrientes": nutrientes, "lotes": salida,
            **repo.filtros_de_campana(eid, anio)}


@router.get("/lotes/{lote_id}")
def get_lote(lote_id: int, anio: int = Query(...),
             empresa_id: int | None = Query(None), _=Depends(sesion)):
    fila = repo.obtener_lote(lote_id)
    if not fila:
        raise HTTPException(404, "Lote no encontrado.")
    params = repo.parametros_o_default(_empresa(empresa_id), anio)
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
                    empresa_id: int | None = Query(None),
                    por: str = Query("zona",
                        pattern="^(zona|sector|rango_edad|material)$"),
                    _=Depends(sesion)):
    eid = _empresa(empresa_id)
    lotes, params, ferts = _cargar(eid, anio)
    if not lotes:
        return {"ok": True, "anio": anio, "grupos": [], "total": {}}
    r = consolidar(lotes, por, params, ferts)
    return {"ok": True, "anio": anio, "empresa_id": eid, "agrupado_por": por,
            "fertilizantes": ferts, **r}


@router.get("/dashboard")
def get_dashboard(anio: int = Query(...), empresa_id: int | None = Query(None),
                  _=Depends(sesion)):
    """Todo lo que necesita la pantalla de resumen, en una sola llamada."""
    eid = _empresa(empresa_id)
    lotes, params, ferts = _cargar(eid, anio)
    if not lotes:
        return {"ok": True, "anio": anio, "empresa_id": eid, "vacio": True}

    por_zona = consolidar(lotes, "zona", params, ferts)
    por_sector = consolidar(lotes, "sector", params, ferts)
    por_edad = consolidar(lotes, "rango_edad", params, ferts)

    precios = params.get("precios", {})
    productos = []
    for f in ferts:
        cant = por_zona["total"].get(f, 0)
        precio = float(precios.get(f) or 0)
        flete = flete_de(params, f)
        productos.append({
            "nombre": f, "cantidad": cant, "precio": precio, "flete": flete,
            "costo_fertilizante": cant * precio,
            "costo_flete": cant * flete,
            "costo": cant * (precio + flete),
        })

    top = sorted(lotes, key=lambda l: l["costos"]["costo_total"], reverse=True)[:10]

    return {
        "ok": True, "anio": anio, "empresa_id": eid, "vacio": False,
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
        "oxido": _resumen_bloque(lotes, "oxido"),
        "rendimiento": _resumen_bloque(lotes, "rendimiento"),
    }


@router.get("/aplicaciones")
def get_aplicaciones(anio: int = Query(...),
                     empresa_id: int | None = Query(None),
                     zona: str | None = Query(None),
                     sector: str | None = Query(None),
                     rango_edad: str | None = Query(None),
                     identificacion: str | None = Query(None),
                     uma: int | None = Query(None),
                     top: int = Query(15, ge=5, le=50),
                     _=Depends(sesion)):
    """
    Análisis del plan en TONELADAS (no en costos):
    por fertilizante, por zona, por sector, lotes que más reciben,
    y las matrices fertilizante × zona y fertilizante × sector.
    """
    eid = _empresa(empresa_id)
    lotes, _p, ferts = _cargar(eid, anio, zona, sector, rango_edad,
                               identificacion, uma)
    if not lotes:
        return {"ok": True, "anio": anio, "empresa_id": eid, "vacio": True,
                **repo.filtros_de_campana(eid, anio)}

    return {"ok": True, "anio": anio, "empresa_id": eid, "vacio": False,
            **aplicaciones(lotes, ferts, top),
            **repo.filtros_de_campana(eid, anio)}


@router.get("/oxido")
def get_oxido(anio: int = Query(...), empresa_id: int | None = Query(None),
              zona: str | None = Query(None), sector: str | None = Query(None),
              rango_edad: str | None = Query(None),
              identificacion: str | None = Query(None),
              uma: int | None = Query(None),
              top: int = Query(15, ge=5, le=50), _=Depends(sesion)):
    """Requerimiento en óxido (P2O5, K2O, CaO, MgO...) por lote."""
    eid = _empresa(empresa_id)
    lotes, _p, _f = _cargar(eid, anio, zona, sector, rango_edad,
                            identificacion, uma)
    if not lotes:
        return {"ok": True, "anio": anio, "empresa_id": eid, "vacio": True,
                **repo.filtros_de_campana(eid, anio)}
    return {"ok": True, "anio": anio, "empresa_id": eid,
            **analisis_elementos(lotes, "oxido", top),
            **repo.filtros_de_campana(eid, anio)}


@router.get("/rendimiento")
def get_rendimiento(anio: int = Query(...), empresa_id: int | None = Query(None),
                    zona: str | None = Query(None),
                    sector: str | None = Query(None),
                    rango_edad: str | None = Query(None),
                    identificacion: str | None = Query(None),
                    uma: int | None = Query(None),
                    top: int = Query(15, ge=5, le=50), _=Depends(sesion)):
    """Requerimiento total para el rendimiento esperado, por lote."""
    eid = _empresa(empresa_id)
    lotes, _p, _f = _cargar(eid, anio, zona, sector, rango_edad,
                            identificacion, uma)
    if not lotes:
        return {"ok": True, "anio": anio, "empresa_id": eid, "vacio": True,
                **repo.filtros_de_campana(eid, anio)}
    return {"ok": True, "anio": anio, "empresa_id": eid,
            **analisis_elementos(lotes, "rendimiento", top),
            **repo.filtros_de_campana(eid, anio)}


@router.get("/comparativo")
def get_comparativo(anios: str = Query(..., description="Ej: 2025,2026"),
                    empresa_id: int | None = Query(None), _=Depends(sesion)):
    eid = _empresa(empresa_id)
    datos, todos = {}, set()
    for texto in anios.split(","):
        texto = texto.strip()
        if not texto.isdigit():
            continue
        anio = int(texto)
        lotes, params, ferts = _cargar(eid, anio)
        if lotes:
            datos[anio] = consolidar(lotes, "zona", params, ferts)
            todos.update(ferts)
    return {"ok": True, "campanas": comparar_campanas(datos),
            "fertilizantes": sorted(todos)}
