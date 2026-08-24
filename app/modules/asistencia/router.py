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
from .calc import (analizar, analizar_completos, analizar_revisar,
                   resumen_trabajador)
from . import formato2, nomina
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
            "departamento": departamento,
            "departamentos": repo.departamentos_disponibles(eid, zid, anio, mes),
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
    # Sin nómina no hay contra qué cruzar: los datos entrarían todos
    # como inactivos y no se verían en el análisis.
    if not repo.hay_nomina(empresa_id):
        raise HTTPException(400, {
            "mensaje": f"No hay trabajadores activos cargados para "
                       f"«{empresa['nombre']}». Carga primero la tabla de "
                       f"trabajadores en la pestaña Trabajadores activos.",
            "advertencias": []})

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

        modo = repo.modo_cruce(empresa_id)
        for t in trabajadores:
            tid = repo.obtener_o_crear_trabajador(
                cur, empresa_id, zid, t["codigo"], t["nombre"], modo)
            for d in t["dias"]:
                repo.guardar_marcacion(cur, periodo_id, tid, d)
                guardadas += 1

        # Congelar el cruce contra la nómina de ESTE momento
        cruce = repo.cruzar_periodo(cur, periodo_id)

    return {"ok": True, "anio": anio, "mes": mes,
            "mes_nombre": nombre_mes(mes), "formato": formato,
            "empresa_id": empresa_id, "empresa": empresa["nombre"],
            "zona_id": zid, "zona": zona["nombre"] if zona else None,
            "archivo": archivo.filename, "dias_mes": total_dias,
            "trabajadores": len(trabajadores),
            "marcaciones": guardadas, "reemplazadas": borradas,
            "cruce": cruce, "modo_cruce": modo,
            "resumen": resultado.get("resumen", {}),
            "advertencias": advertencias}


# ============================================================
#  ANÁLISIS
# ============================================================

def _contexto(eid: int, anio, mes, dia, supervisor) -> dict:
    """Valores para los desplegables, siempre sobre trabajadores activos."""
    return {
        "anios": repo.anios_vista(eid),
        "meses": [{"mes": m, "nombre": nombre_mes(m)}
                  for m in (repo.meses_vista(eid, anio) if anio else [])],
        "dias": repo.dias_vista(eid, anio, mes) if (anio and mes) else [],
        "supervisores": repo.supervisores_disponibles(eid),
        "nomina": repo.resumen_nomina(),
    }


@router.get("/analisis")
def get_analisis(empresa_id: int | None = Query(None),
                 anio: int | None = Query(None),
                 mes: int | None = Query(None),
                 dia: int | None = Query(None),
                 trabajador: str | None = Query(None),
                 supervisor: str | None = Query(None),
                 top: int = Query(10, ge=5, le=50),
                 _=Depends(sesion)):
    """
    Jornadas de los trabajadores activos.

    Solo entran los días con entrada Y salida: es donde se miden
    horarios y duraciones. Los casos incompletos y las ausencias van
    a la pestaña «A revisar».

    No se separa por zona: una persona puede marcar hoy en Vizcaina y
    mañana en Peroles, y sigue siendo su misma jornada. Cada día suyo
    aparece una sola vez.
    """
    eid = _empresa(empresa_id)
    filas = repo.marcaciones_vista(eid, anio, mes, dia, trabajador, supervisor)
    padron = repo.padron_activo(eid, anio, mes, supervisor)

    empresa = repo.empresa_por_id(eid)
    return {"ok": True, "empresa_id": eid,
            "empresa": empresa["nombre"] if empresa else None,
            "anio": anio, "mes": mes, "dia": dia,
            "mes_nombre": nombre_mes(mes) if mes else None,
            "supervisor": supervisor,
            **analizar_completos(filas, padron, top),
            **_contexto(eid, anio, mes, dia, supervisor)}


@router.get("/revisar")
def get_revisar(empresa_id: int | None = Query(None),
                anio: int | None = Query(None),
                mes: int | None = Query(None),
                dia: int | None = Query(None),
                trabajador: str | None = Query(None),
                supervisor: str | None = Query(None),
                top: int = Query(10, ge=5, le=50),
                _=Depends(sesion)):
    """
    Casos a revisar: solo entrada, solo salida o ninguna marca.

    Las ausencias no existen como registro (las celdas vacías del Excel
    no se guardan), así que se deducen comparando el padrón de activos
    con quienes sí tienen marcación.
    """
    eid = _empresa(empresa_id)
    filas = repo.marcaciones_vista(eid, anio, mes, dia, trabajador, supervisor)
    padron = repo.padron_activo(eid, anio, mes, supervisor)

    empresa = repo.empresa_por_id(eid)
    return {"ok": True, "empresa_id": eid,
            "empresa": empresa["nombre"] if empresa else None,
            "anio": anio, "mes": mes, "dia": dia,
            "mes_nombre": nombre_mes(mes) if mes else None,
            "supervisor": supervisor,
            **analizar_revisar(filas, padron, un_dia=bool(dia), top=top),
            **_contexto(eid, anio, mes, dia, supervisor)}


# ============================================================
#  DESCARGAS
# ============================================================

def _nombre_archivo(base: str, empresa, anio, mes, dia) -> str:
    """casos_a_revisar_palmeras_de_yarima_082026.xlsx"""
    import re
    partes = [base]
    if empresa:
        limpio = re.sub(r"[^a-z0-9]+", "_",
                        str(empresa).lower()
                        .replace("á", "a").replace("é", "e").replace("í", "i")
                        .replace("ó", "o").replace("ú", "u").replace("ñ", "n"))
        partes.append(limpio.strip("_"))
    if mes and anio:
        partes.append(f"{int(mes):02d}{anio}")
    elif anio:
        partes.append(str(anio))
    if dia:
        partes.append(f"dia{int(dia):02d}")
    return "_".join(p for p in partes if p) + ".xlsx"


def _texto_filtros(empresa, anio, mes, dia, supervisor, trabajador) -> str:
    partes = [f"Empresa: {empresa or 'todas'}"]
    partes.append(f"Año: {anio or 'todos'}")
    partes.append(f"Mes: {nombre_mes(mes) if mes else 'todos'}")
    partes.append(f"Día: {dia or 'todos'}")
    if supervisor:
        partes.append(f"Supervisor: {supervisor}")
    if trabajador:
        partes.append(f"Búsqueda: {trabajador}")
    return "Filtros aplicados\n" + "\n".join(partes)


@router.get("/analisis/excel")
def get_analisis_excel(empresa_id: int | None = Query(None),
                       anio: int | None = Query(None),
                       mes: int | None = Query(None),
                       dia: int | None = Query(None),
                       trabajador: str | None = Query(None),
                       supervisor: str | None = Query(None),
                       _=Depends(sesion)):
    """Excel con los trabajadores que sí marcaron entrada y salida."""
    eid = _empresa(empresa_id)
    filas = repo.marcaciones_vista(eid, anio, mes, dia, trabajador,
                                   supervisor, solo_completos=True)
    empresa = repo.empresa_por_id(eid)

    columnas = ["Código", "Nombre", "Supervisor", "Fecha",
                "Hora inicio", "Hora fin", "Duración jornada", "Horas"]
    datos = []
    for f in filas:
        minutos = f.get("minutos")
        datos.append([
            f.get("codigo"), f.get("nombre"), f.get("supervisor"),
            str(f.get("fecha")),
            f["entrada"].strftime("%H:%M") if f.get("entrada") else None,
            f["salida"].strftime("%H:%M") if f.get("salida") else None,
            f"{minutos // 60}h {minutos % 60:02d}m" if minutos is not None else None,
            round(minutos / 60, 2) if minutos is not None else None,
        ])

    nombre_emp = empresa["nombre"] if empresa else None
    contenido = nomina.exportar_tabla(
        "asistencia", columnas, datos,
        _texto_filtros(nombre_emp, anio, mes, dia, supervisor, trabajador))
    archivo = _nombre_archivo("asistencia", nombre_emp, anio, mes, dia)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition":
                             f'attachment; filename="{archivo}"'})


@router.get("/revisar/excel")
def get_revisar_excel(empresa_id: int | None = Query(None),
                      anio: int | None = Query(None),
                      mes: int | None = Query(None),
                      dia: int | None = Query(None),
                      trabajador: str | None = Query(None),
                      supervisor: str | None = Query(None),
                      _=Depends(sesion)):
    """Excel con los casos a revisar."""
    eid = _empresa(empresa_id)
    filas = repo.marcaciones_vista(eid, anio, mes, dia, trabajador, supervisor)
    padron = repo.padron_activo(eid, anio, mes, supervisor)
    empresa = repo.empresa_por_id(eid)

    r = analizar_revisar(filas, padron, un_dia=bool(dia), top=50)
    columnas = ["Código", "Nombre", "Supervisor", "Fecha",
                "Hora inicio", "Hora fin", "Situación"]
    datos = [[x.get("codigo"), x.get("nombre"), x.get("supervisor"),
              x.get("fecha"), x.get("entrada"), x.get("salida"),
              x.get("motivo")] for x in r["revisar_todos"]]

    nombre_emp = empresa["nombre"] if empresa else None
    contenido = nomina.exportar_tabla(
        "casos a revisar", columnas, datos,
        _texto_filtros(nombre_emp, anio, mes, dia, supervisor, trabajador))
    archivo = _nombre_archivo("casos_a_revisar", nombre_emp, anio, mes, dia)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition":
                             f'attachment; filename="{archivo}"'})


# ============================================================
#  TRABAJADORES ACTIVOS
# ============================================================

@router.get("/nomina")
def get_nomina(_=Depends(sesion)):
    return {"ok": True, "resumen": repo.resumen_nomina()}


@router.get("/nomina/formato")
def get_formato_nomina(_=Depends(sesion)):
    return Response(content=nomina.generar_formato(), media_type=XLSX,
                    headers={"Content-Disposition":
                             'attachment; filename="trabajadores_activos.xlsx"'})


@router.post("/nomina/carga")
async def post_nomina(archivo: UploadFile = File(...), usuario=Depends(sesion)):
    """
    Carga la tabla de trabajadores activos de TODAS las empresas.
    La empresa viene en el archivo, así que no se elige aquí.
    Cada carga reemplaza por completo la anterior.
    """
    if not archivo.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "El archivo debe ser .xlsx")

    registros, advertencias = nomina.leer_nomina(await archivo.read())
    if not registros:
        raise HTTPException(400, {"mensaje": "No se cargó nada.",
                                  "advertencias": advertencias})

    with db.get_cursor() as cur:
        r = repo.reemplazar_nomina(cur, registros, archivo.filename,
                                   usuario["usuario"])

    return {"ok": True, "archivo": archivo.filename, **r,
            "resumen": repo.resumen_nomina(),
            "advertencias": advertencias}


@router.get("/nomina/sin-cruzar")
def get_sin_cruzar(empresa_id: int | None = Query(None), _=Depends(sesion)):
    """Gente del huellero cuyo id compuesto no está en la nómina."""
    eid = _empresa(empresa_id)
    return {"ok": True, "empresa_id": eid, "pendientes": repo.sin_cruzar(eid)}


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
