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
from . import formato2
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


def _zona(empresa_id: int, zona_id: int | None) -> int | None:
    """Valida que la zona pertenezca a la empresa. None = todas las zonas."""
    if not zona_id:
        return None
    z = repo.zona_por_id(int(zona_id))
    if not z or z["empresa_id"] != empresa_id:
        raise HTTPException(400, "Esa zona no pertenece a la empresa seleccionada.")
    return int(zona_id)


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


@router.get("/zonas")
def get_zonas(empresa_id: int | None = Query(None), _=Depends(sesion)):
    """Zonas (huelleros) de la empresa. El selector depende de ella."""
    return {"ok": True, "zonas": repo.listar_zonas(_empresa(empresa_id))}


@router.get("/periodos")
def get_periodos(empresa_id: int | None = Query(None), _=Depends(sesion)):
    return {"ok": True, "periodos": repo.listar_periodos(empresa_id)}


@router.get("/filtros")
def get_filtros(empresa_id: int | None = Query(None),
                zona_id: int | None = Query(None),
                anio: int | None = Query(None),
                mes: int | None = Query(None), _=Depends(sesion)):
    """Valores disponibles para los desplegables, según lo ya cargado."""
    eid = _empresa(empresa_id)
    zid = _zona(eid, zona_id)
    anios = repo.anios_disponibles(eid, zid)
    meses = repo.meses_disponibles(eid, anio, zid) if anio else []
    dias = repo.dias_con_registro(eid, anio, mes, zid) if (anio and mes) else []
    return {"ok": True, "empresa_id": eid, "zona_id": zid,
            "zonas": repo.listar_zonas(eid), "anios": anios,
            "meses": [{"mes": m, "nombre": nombre_mes(m)} for m in meses],
            "dias": dias}


@router.delete("/periodos/{anio}/{mes}")
def delete_periodo(anio: int, mes: int, zona_id: int = Query(...),
                   empresa_id: int | None = Query(None), _=Depends(sesion)):
    eid = _empresa(empresa_id)
    if not repo.eliminar_periodo(eid, _zona(eid, zona_id), anio, mes):
        raise HTTPException(404, "No existe ese período para esa empresa y zona.")
    return {"ok": True}


# ============================================================
#  FORMATO Y CARGA
# ============================================================

@router.get("/formato")
def get_formato(anio: int = Query(..., ge=1990, le=2100),
                mes: int = Query(..., ge=1, le=12),
                zona_id: int = Query(...),
                formato: int = Query(1, ge=1, le=2),
                empresa_id: int | None = Query(None),
                precargar: bool = Query(True),
                _=Depends(sesion)):
    """
    Genera el formato del huellero elegido.

    Formato 1 · matriz: una columna por día del mes.
    Formato 2 · lista: una fila por trabajador y fecha.

    En ambos, los días salen del mes elegido (febrero bisiesto, 29).
    """
    eid = _empresa(empresa_id)
    zid = _zona(eid, zona_id)

    personas = None
    if precargar and zid:
        # Gente de ESA zona el mes anterior, para no reescribir la lista
        prev_anio, prev_mes = (anio - 1, 12) if mes == 1 else (anio, mes - 1)
        personas = repo.trabajadores_de_periodo(eid, zid, prev_anio, prev_mes)
        if not personas:
            personas = repo.trabajadores_de_periodo(eid, zid, anio)

    generador = formato2.generar_formato if formato == 2 else generar_formato
    contenido = generador(anio, mes, personas)

    z = repo.zona_por_id(zid) if zid else None
    etiqueta = (z["nombre"].lower().replace(" ", "_") + "_") if z else ""
    nombre = f"asistencia_f{formato}_{etiqueta}{anio}_{mes:02d}.xlsx"
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition":
                             f'attachment; filename="{nombre}"'})


@router.post("/carga")
async def post_carga(
    anio: int = Form(...),
    mes: int = Form(...),
    empresa_id: int = Form(...),
    zona_id: int = Form(...),
    formato: int = Form(1),
    archivo: UploadFile = File(...),
    reemplazar: bool = Form(True),
    usuario=Depends(sesion),
):
    """
    Carga el reporte de UN huellero: empresa + zona + año + mes.

    Cada zona va aparte, así cargar Peroles no borra Vizcaina.
    Por defecto reemplaza los datos de ESA zona en ESE mes.

    El formato define qué pipeline se usa para leer el archivo:
      1 · matriz de días (huellero nuevo)
      2 · una fila por trabajador y fecha (huellero antiguo)
    """
    if not archivo.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "El archivo debe ser .xlsx")
    if not 1 <= mes <= 12:
        raise HTTPException(400, "Mes inválido.")
    if formato not in (1, 2):
        raise HTTPException(400, "Formato inválido: debe ser 1 o 2.")

    empresa = repo.empresa_por_id(empresa_id)
    if not empresa:
        raise HTTPException(400, "Selecciona una empresa válida antes de cargar.")

    zid = _zona(empresa_id, zona_id)
    if not zid:
        raise HTTPException(400, "Selecciona la zona antes de cargar.")
    zona = repo.zona_por_id(zid)

    lector = formato2.leer_excel if formato == 2 else leer_excel
    resultado, advertencias = lector(await archivo.read(), anio, mes)
    trabajadores = (resultado or {}).get("trabajadores") or []
    if not trabajadores:
        raise HTTPException(400, {"mensaje": "No se cargó nada.",
                                  "advertencias": advertencias})

    total_dias = dias_del_mes(anio, mes)
    borradas = guardadas = 0

    with db.get_cursor() as cur:
        periodo_id = repo.obtener_o_crear_periodo(
            cur, empresa_id, zid, anio, mes, total_dias, formato,
            archivo.filename, usuario["usuario"])

        if reemplazar:
            borradas = repo.borrar_marcaciones(cur, periodo_id)

        for t in trabajadores:
            tid = repo.obtener_o_crear_trabajador(
                cur, empresa_id, zid, t["codigo"], t["nombre"])
            for d in t["dias"]:
                repo.guardar_marcacion(cur, periodo_id, tid, d)
                guardadas += 1

    return {"ok": True, "anio": anio, "mes": mes,
            "mes_nombre": nombre_mes(mes), "formato": formato,
            "empresa_id": empresa_id, "empresa": empresa["nombre"],
            "zona_id": zid, "zona": zona["nombre"] if zona else None,
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
                 zona_id: int | None = Query(None),
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
    zid = _zona(eid, zona_id)
    filas = repo.listar_marcaciones(eid, anio, mes, dia, trabajador, zid)

    resultado = analizar(filas, top)
    empresa = repo.empresa_por_id(eid)
    zona = repo.zona_por_id(zid) if zid else None

    dias = repo.dias_con_registro(eid, anio, mes, zid) if (anio and mes) else []

    return {"ok": True, "empresa_id": eid,
            "empresa": empresa["nombre"] if empresa else None,
            "zona_id": zid, "zona": zona["nombre"] if zona else None,
            "anio": anio, "mes": mes, "dia": dia,
            "mes_nombre": nombre_mes(mes) if mes else None,
            "zonas": repo.listar_zonas(eid),
            "anios": repo.anios_disponibles(eid, zid),
            "meses": [{"mes": m, "nombre": nombre_mes(m)}
                      for m in (repo.meses_disponibles(eid, anio, zid) if anio else [])],
            "dias": dias,
            **resultado}


@router.get("/trabajadores")
def get_trabajadores(empresa_id: int | None = Query(None),
                     zona_id: int | None = Query(None), _=Depends(sesion)):
    eid = _empresa(empresa_id)
    return {"ok": True,
            "trabajadores": repo.listar_trabajadores(eid, _zona(eid, zona_id))}


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
