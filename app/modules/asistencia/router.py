"""
PalmaData · Asistencia · Endpoints
==================================
Rutas bajo /api/asistencia. Todas exigen sesión.
El router no tiene SQL (está en repository) ni fórmulas (están en calc).
"""
from fastapi import (APIRouter, Body, Depends, File, Form, HTTPException,
                     Query, Request, UploadFile)
from fastapi.responses import Response

from ...core import db, security
from . import repository as repo
from .calc import analizar, resumen_trabajador
from .excel_loader import dias_del_mes, generar_formato, leer_excel, nombre_mes

router = APIRouter(prefix="/api/asistencia", tags=["asistencia"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def sesion(request: Request) -> dict:
    usuario = security.usuario_actual(request)
    if not usuario:
        raise HTTPException(401, "Sesión no iniciada.")
    return usuario


def _empresa(empresa_id: int | None) -> int:
    if empresa_id:
        return int(empresa_id)
    e = repo.empresa_por_defecto()
    if not e:
        raise HTTPException(400, "No hay empresas registradas.")
    return e["id"]


def _serializar(f: dict) -> dict:
    """Convierte fechas y horas a texto para el JSON."""
    d = dict(f)
    if d.get("fecha") is not None:
        d["fecha"] = str(d["fecha"])
    for campo in ("entrada", "salida"):
        if d.get(campo) is not None:
            d[campo] = d[campo].strftime("%H:%M")
    return d


# ============================================================
#  CATÁLOGOS
# ============================================================

@router.get("/empresas")
def get_empresas(_=Depends(sesion)):
    return {"ok": True, "empresas": repo.listar_empresas()}


@router.get("/periodos")
def get_periodos(empresa_id: int | None = Query(None), _=Depends(sesion)):
    return {"ok": True, "periodos": repo.listar_periodos(empresa_id)}


@router.get("/filtros")
def get_filtros(empresa_id: int | None = Query(None),
                anio: int | None = Query(None),
                mes: int | None = Query(None), _=Depends(sesion)):
    """Valores disponibles para los desplegables, según lo ya cargado."""
    eid = _empresa(empresa_id)
    anios = repo.anios_disponibles(eid)
    meses = repo.meses_disponibles(eid, anio) if anio else []
    dias = repo.dias_con_registro(eid, anio, mes) if (anio and mes) else []
    return {"ok": True, "empresa_id": eid, "anios": anios,
            "meses": [{"mes": m, "nombre": nombre_mes(m)} for m in meses],
            "dias": dias}


@router.delete("/periodos/{anio}/{mes}")
def delete_periodo(anio: int, mes: int, empresa_id: int | None = Query(None),
                   _=Depends(sesion)):
    if not repo.eliminar_periodo(_empresa(empresa_id), anio, mes):
        raise HTTPException(404, "No existe ese período para esa empresa.")
    return {"ok": True}


# ============================================================
#  FORMATO Y CARGA
# ============================================================

@router.get("/formato")
def get_formato(anio: int = Query(..., ge=1990, le=2100),
                mes: int = Query(..., ge=1, le=12),
                empresa_id: int | None = Query(None),
                precargar: bool = Query(True),
                _=Depends(sesion)):
    """
    Genera el formato con las columnas de día que tenga ESE mes.
    Febrero de año bisiesto trae 29; abril, 30; enero, 31.
    """
    eid = _empresa(empresa_id)

    personas = None
    if precargar:
        # Gente del mes anterior, para no reescribir la lista cada mes
        prev_anio, prev_mes = (anio - 1, 12) if mes == 1 else (anio, mes - 1)
        personas = repo.trabajadores_de_periodo(eid, prev_anio, prev_mes)
        if not personas:
            personas = repo.trabajadores_de_periodo(eid, anio)

    contenido = generar_formato(anio, mes, personas)
    nombre = f"asistencia_{anio}_{mes:02d}.xlsx"
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition":
                             f'attachment; filename="{nombre}"'})


@router.post("/carga")
async def post_carga(
    anio: int = Form(...),
    mes: int = Form(...),
    empresa_id: int = Form(...),
    archivo: UploadFile = File(...),
    reemplazar: bool = Form(True),
    usuario=Depends(sesion),
):
    """
    Carga el reporte del huellero de UNA empresa en UN mes.

    Por defecto reemplaza: borra las marcaciones de ese período y
    carga las del archivo. Así, si te equivocaste de archivo, subes
    el correcto y no quedan datos viejos mezclados.
    """
    if not archivo.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "El archivo debe ser .xlsx")
    if not 1 <= mes <= 12:
        raise HTTPException(400, "Mes inválido.")

    empresa = repo.empresa_por_id(empresa_id)
    if not empresa:
        raise HTTPException(400, "Selecciona una empresa válida antes de cargar.")

    resultado, advertencias = leer_excel(await archivo.read(), anio, mes)
    trabajadores = (resultado or {}).get("trabajadores") or []
    if not trabajadores:
        raise HTTPException(400, {"mensaje": "No se cargó nada.",
                                  "advertencias": advertencias})

    total_dias = dias_del_mes(anio, mes)
    borradas = guardadas = 0

    with db.get_cursor() as cur:
        periodo_id = repo.obtener_o_crear_periodo(
            cur, empresa_id, anio, mes, total_dias,
            archivo.filename, usuario["usuario"])

        if reemplazar:
            borradas = repo.borrar_marcaciones(cur, periodo_id)

        for t in trabajadores:
            tid = repo.obtener_o_crear_trabajador(
                cur, empresa_id, t["codigo"], t["nombre"])
            for d in t["dias"]:
                repo.guardar_marcacion(cur, periodo_id, tid, d)
                guardadas += 1

    return {"ok": True, "anio": anio, "mes": mes,
            "mes_nombre": nombre_mes(mes),
            "empresa_id": empresa_id, "empresa": empresa["nombre"],
            "archivo": archivo.filename, "dias_mes": total_dias,
            "trabajadores": len(trabajadores),
            "marcaciones": guardadas, "reemplazadas": borradas,
            "resumen": resultado.get("resumen", {}),
            "advertencias": advertencias}


# ============================================================
#  ANÁLISIS
# ============================================================

@router.get("/analisis")
def get_analisis(empresa_id: int | None = Query(None),
                 anio: int | None = Query(None),
                 mes: int | None = Query(None),
                 dia: int | None = Query(None),
                 trabajador: str | None = Query(None),
                 top: int = Query(10, ge=5, le=50),
                 _=Depends(sesion)):
    """
    Análisis de asistencia.

    Los promedios se calculan sobre los días CON REGISTRO, nunca sobre
    los días del calendario: los domingos y festivos no bajan a nadie.

    Sin filtros de fecha promedia todo el histórico de la empresa.
    Con año, ese año. Con año y mes, ese mes. Con día, ese día exacto
    (y entonces el "promedio" es el dato del día).
    """
    eid = _empresa(empresa_id)
    filas = repo.listar_marcaciones(eid, anio, mes, dia, trabajador)

    resultado = analizar(filas, top)
    empresa = repo.empresa_por_id(eid)

    # Días disponibles para el filtro
    dias = repo.dias_con_registro(eid, anio, mes) if (anio and mes) else []

    return {"ok": True, "empresa_id": eid,
            "empresa": empresa["nombre"] if empresa else None,
            "anio": anio, "mes": mes, "dia": dia,
            "mes_nombre": nombre_mes(mes) if mes else None,
            "anios": repo.anios_disponibles(eid),
            "meses": [{"mes": m, "nombre": nombre_mes(m)}
                      for m in (repo.meses_disponibles(eid, anio) if anio else [])],
            "dias": dias,
            **resultado}


@router.get("/trabajadores")
def get_trabajadores(empresa_id: int | None = Query(None), _=Depends(sesion)):
    return {"ok": True, "trabajadores": repo.listar_trabajadores(_empresa(empresa_id))}


@router.get("/trabajadores/{trabajador_id}")
def get_trabajador(trabajador_id: int, anio: int | None = Query(None),
                   mes: int | None = Query(None), _=Depends(sesion)):
    """Detalle día a día de una persona."""
    filas = repo.marcaciones_de_trabajador(trabajador_id, anio, mes)
    if not filas:
        raise HTTPException(404, "Sin marcaciones para ese trabajador.")

    return {"ok": True,
            "trabajador": {"id": trabajador_id,
                           "codigo": filas[0]["codigo"],
                           "nombre": filas[0]["nombre"],
                           "empresa": filas[0]["empresa"]},
            "resumen": resumen_trabajador(filas),
            "dias": [_serializar(f) for f in filas]}
