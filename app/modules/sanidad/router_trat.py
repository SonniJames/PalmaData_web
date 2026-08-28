"""
PalmaData · Sanidad · Tratamientos · Endpoints
==============================================
Rutas bajo /api/sanidad/trat. Todas exigen sesión.

Espejo de los endpoints del censo sobre san_enf_tratamiento, sin el
filtro de erróneos (aquí no existe esa validación) y con la descarga
del consolidado filtrable también por fecha de actualización.

Los ayudantes de sesión, filtros y Excel se reutilizan del router
del censo: son idénticos a propósito.
"""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response

from . import repository_trat as repo
from .router import (XLSX, _excel, _exigir_fecha, _fila, _filtros, _ids,
                     _limpiar, _nombre, _quien, sesion)

# Prefijo RELATIVO: este router se monta dentro del de sanidad, que ya
# aporta /api/sanidad. Las rutas finales quedan en /api/sanidad/trat/...
router_trat = APIRouter(prefix="/trat", tags=["sanidad-tratamientos"])


# ============================================================
#  CATÁLOGOS
# ============================================================

@router_trat.get("/catalogos")
def get_catalogos(_=Depends(sesion)):
    """Todo lo que necesitan los desplegables de la ventana de edición.

    Enfermedades y eventos se reutilizan del censo: son los mismos
    catálogos. Lo propio de aquí son los tratamientos y los
    evaluadores que registran tratamientos.
    """
    from . import repository as repo_censo
    return {"ok": True,
            "enfermedades": repo_censo.listar_enfermedades(),
            "eventos": repo_censo.listar_eventos(),
            "tratamientos": repo.listar_tratamientos(),
            "evaluadores": [_fila(x) for x in repo.listar_evaluadores()],
            "fechas": [_fila(x) for x in repo.fechas_disponibles()],
            "actualizaciones": [_fila(x) for x in repo.fechas_actualizacion()]}


# ============================================================
#  REVISIÓN
# ============================================================

@router_trat.get("/revision")
def get_revision(fecha_desde: date | None = Query(None),
                 fecha_hasta: date | None = Query(None),
                 actualiza_desde: date | None = Query(None),
                 actualiza_hasta: date | None = Query(None),
                 cat_lote_id: int | None = Query(None),
                 evaluador: int | None = Query(None),
                 ver_anulados: bool = Query(False),
                 limite: int = Query(1000, ge=1, le=10000),
                 _=Depends(sesion)):
    """
    Los tratamientos para revisar y corregir.

    Se puede filtrar por fecha del tratamiento o por fecha de
    actualización —el día en que se descargaron del celular— y además
    por lote y por evaluador.
    """
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde,
                 actualiza_hasta, cat_lote_id, evaluador)
    _exigir_fecha(f)

    filas = repo.listar_revision(f, ver_anulados, limite)
    return {"ok": True, "filtros": {k: _limpiar(v) for k, v in f.items()},
            "total": len(filas), "limite": limite,
            "truncado": len(filas) >= limite,
            "resumen": _fila(repo.resumen(f)),
            "registros": [_fila(x) for x in filas]}


@router_trat.get("/distribucion")
def get_distribucion(campo: str = Query(..., pattern="^(tratamiento|enfermedad|evento|trabajador|lote|fecha)$"),
                     fecha_desde: date | None = Query(None),
                     fecha_hasta: date | None = Query(None),
                     actualiza_desde: date | None = Query(None),
                     actualiza_hasta: date | None = Query(None),
                     cat_lote_id: int | None = Query(None),
                     evaluador: int | None = Query(None),
                     limite: int = Query(20, ge=3, le=100),
                     _=Depends(sesion)):
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde,
                 actualiza_hasta, cat_lote_id, evaluador)
    _exigir_fecha(f)
    return {"ok": True, "campo": campo,
            "datos": [_fila(x) for x in repo.distribucion(campo, f, limite)]}


@router_trat.get("/duplicados")
def get_duplicados(fecha_desde: date | None = Query(None),
                   fecha_hasta: date | None = Query(None),
                   actualiza_desde: date | None = Query(None),
                   actualiza_hasta: date | None = Query(None),
                   cat_lote_id: int | None = Query(None),
                   evaluador: int | None = Query(None),
                   limite: int = Query(1000, ge=1, le=10000),
                   _=Depends(sesion)):
    """
    Mismo lote, misma línea, misma palma, mismo día: casi siempre un
    doble registro.

    Ser duplicado depende de OTRAS filas, por eso es una vista y no una
    columna: si de tres repetidos se anulan dos, el que queda deja de
    serlo solo.
    """
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde,
                 actualiza_hasta, cat_lote_id, evaluador)
    _exigir_fecha(f)
    filas = repo.duplicados(f, limite)

    # Cuántos grupos distintos hay: tres filas repetidas son un caso, no tres.
    # El lote entra en la clave, igual que en la vista.
    grupos = len({(str(x["fecha"]), x["lote"], x["linea"], x["palma"])
                  for x in filas})

    return {"ok": True, "total": len(filas), "grupos": grupos,
            "duplicados": [_fila(x) for x in filas]}


# ============================================================
#  CORRECCIONES
# ============================================================

@router_trat.post("/corregir-lote")
def post_corregir_lote(datos: dict = Body(...), usuario=Depends(sesion)):
    """Cambia el lote de uno o varios tratamientos a la vez."""
    ids = _ids(datos)
    cat_lote_id = datos.get("cat_lote_id")
    if not cat_lote_id:
        raise HTTPException(400, "Selecciona el lote correcto.")

    try:
        n = repo.corregir_lote(ids, int(cat_lote_id), _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


@router_trat.post("/corregir")
def post_corregir(datos: dict = Body(...), usuario=Depends(sesion)):
    """
    Corrige un tratamiento campo a campo.

    Los campos que no se envían quedan como estaban: se puede cambiar
    solo la cantidad sin tocar el resto.
    """
    id_registro = datos.get("id")
    if not id_registro:
        raise HTTPException(400, "Falta el registro a corregir.")

    campos = {k: datos.get(k) for k in
              ("cat_lote_id", "linea", "palma", "san_enfermedades_id",
               "san_evento_enf_id", "san_evento_trat_id", "cantidad",
               "observaciones")}
    if all(v in (None, "") for v in campos.values()):
        raise HTTPException(400, "No se envió ningún cambio.")

    campos = {k: (None if v in (None, "") else v) for k, v in campos.items()}

    try:
        n = repo.corregir_registro(int(id_registro), _quien(usuario), campos)
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


@router_trat.post("/anular")
def post_anular(datos: dict = Body(...), usuario=Depends(sesion)):
    """Marca tratamientos como anulados. No los borra: quedan auditables."""
    ids = _ids(datos)
    try:
        n = repo.anular(ids, _quien(usuario), datos.get("motivo"))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "anulados": n}


@router_trat.post("/reactivar")
def post_reactivar(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    try:
        n = repo.reactivar(ids, _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "reactivados": n}


# ============================================================
#  DESCARGAS
# ============================================================

COLUMNAS_CONSOLIDADO = [
    ("registro_id", "REGISTRO ID"), ("fecha", "FECHA"), ("hora", "HORA"),
    ("lote", "LOTE"), ("linea", "LINEA"), ("palma", "PALMA"),
    ("palma_id", "PALMA ID"), ("enfermedad", "ENFERMEDAD"),
    ("evento", "EVENTO"), ("tratamiento", "TRATAMIENTO"),
    ("descripcion", "DESCRIPCION"), ("cantidad", "CANTIDAD"),
    ("evaluador", "EVALUADOR"), ("observaciones", "OBSERVACIONES"),
]


def _exigir_fecha_descarga(fd, fh, ad, ah):
    if not any([fd, fh, ad, ah]):
        raise HTTPException(400, "Selecciona un rango de fechas: por fecha "
                                 "del tratamiento o por fecha de actualización.")


@router_trat.get("/consolidado")
def get_consolidado(fecha_desde: date | None = Query(None),
                    fecha_hasta: date | None = Query(None),
                    actualiza_desde: date | None = Query(None),
                    actualiza_hasta: date | None = Query(None),
                    _=Depends(sesion)):
    """Vista previa del consolidado antes de descargarlo."""
    _exigir_fecha_descarga(fecha_desde, fecha_hasta,
                           actualiza_desde, actualiza_hasta)
    filas = repo.consolidado(fecha_desde, fecha_hasta,
                             actualiza_desde, actualiza_hasta)
    return {"ok": True, "total": len(filas),
            "columnas": [e for _c, e in COLUMNAS_CONSOLIDADO],
            "registros": [_fila(x) for x in filas[:500]]}


@router_trat.get("/consolidado/excel")
def get_consolidado_excel(fecha_desde: date | None = Query(None),
                          fecha_hasta: date | None = Query(None),
                          actualiza_desde: date | None = Query(None),
                          actualiza_hasta: date | None = Query(None),
                          _=Depends(sesion)):
    """
    Descarga el consolidado de tratamientos.

    Filtra por fecha del TRATAMIENTO o por fecha de ACTUALIZACIÓN
    (el día en que los registros se descargaron del celular),
    con las correcciones ya aplicadas. No incluye anulados.
    """
    _exigir_fecha_descarga(fecha_desde, fecha_hasta,
                           actualiza_desde, actualiza_hasta)

    filas = repo.consolidado(fecha_desde, fecha_hasta,
                             actualiza_desde, actualiza_hasta)
    if not filas:
        raise HTTPException(404, "No hay registros para esas fechas.")

    nota = ("Consolidado de tratamientos\n"
            f"Fecha del tratamiento: {fecha_desde or 'sin límite'} "
            f"a {fecha_hasta or 'sin límite'}\n"
            f"Fecha de actualización: {actualiza_desde or 'sin límite'} "
            f"a {actualiza_hasta or 'sin límite'}\n"
            f"Registros: {len(filas)}\n"
            "No incluye los anulados.")

    contenido = _excel("consolidado", COLUMNAS_CONSOLIDADO, filas, nota)
    archivo = _nombre("tratamientos_consolidado",
                      fecha_desde or actualiza_desde,
                      fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition":
                             f'attachment; filename="{archivo}"'})


@router_trat.get("/duplicados/excel")
def get_duplicados_excel(fecha_desde: date | None = Query(None),
                         fecha_hasta: date | None = Query(None),
                         actualiza_desde: date | None = Query(None),
                         actualiza_hasta: date | None = Query(None),
                         cat_lote_id: int | None = Query(None),
                         evaluador: int | None = Query(None),
                         _=Depends(sesion)):
    """Los duplicados del período, para revisarlos fuera de la pantalla."""
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde,
                 actualiza_hasta, cat_lote_id, evaluador)
    _exigir_fecha(f)

    filas = repo.duplicados(f, 10000)
    columnas = [("fecha", "Fecha"), ("hora", "Hora"), ("lote", "Lote"),
                ("linea", "Linea"), ("palma", "Palma"),
                ("repeticiones", "Veces"),
                ("enfermedad", "Enfermedad"), ("evento", "Evento"),
                ("tratamiento", "Tratamiento"), ("cantidad", "Cantidad"),
                ("trabajador", "Trabajador"),
                ("observaciones", "Observaciones"),
                ("id_unico", "ID_unico")]

    nota = ("Registros duplicados de tratamientos\n"
            "Misma palma, misma línea, mismo día.\n"
            f"Fecha del tratamiento: {fecha_desde or '—'} a {fecha_hasta or '—'}\n"
            f"Fecha de actualización: {actualiza_desde or '—'} "
            f"a {actualiza_hasta or '—'}\n"
            f"Registros: {len(filas)}")

    contenido = _excel("duplicados", columnas, filas, nota)
    archivo = _nombre("tratamientos_duplicados",
                      fecha_desde or actualiza_desde,
                      fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition":
                             f'attachment; filename="{archivo}"'})


@router_trat.get("/revision/excel")
def get_revision_excel(fecha_desde: date | None = Query(None),
                       fecha_hasta: date | None = Query(None),
                       actualiza_desde: date | None = Query(None),
                       actualiza_hasta: date | None = Query(None),
                       cat_lote_id: int | None = Query(None),
                       evaluador: int | None = Query(None),
                       ver_anulados: bool = Query(False),
                       _=Depends(sesion)):
    """La tabla de revisión tal como se ve en pantalla."""
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde,
                 actualiza_hasta, cat_lote_id, evaluador)
    _exigir_fecha(f)

    filas = repo.listar_revision(f, ver_anulados, 10000)
    columnas = [("fecha", "Fecha"), ("hora", "Hora"), ("lote", "Lote"),
                ("linea", "Linea"), ("palma", "Palma"),
                ("enfermedad", "Enfermedad"), ("evento", "Evento"),
                ("tratamiento", "Tratamiento"), ("cantidad", "Cantidad"),
                ("trabajador", "Trabajador"),
                ("observaciones", "Observaciones"),
                ("fecha_actualizacion", "Fecha actualización"),
                ("corregido_por", "Corregido por"),
                ("corregido_at", "Corregido el"),
                ("anulado_por", "Anulado por"),
                ("id_unico", "ID_unico")]

    nota = ("Revisión de tratamientos\n"
            f"Fecha del tratamiento: {fecha_desde or '—'} a {fecha_hasta or '—'}\n"
            f"Fecha de actualización: {actualiza_desde or '—'} "
            f"a {actualiza_hasta or '—'}\n"
            f"Registros: {len(filas)}")

    contenido = _excel("revision", columnas, filas, nota)
    archivo = _nombre("tratamientos_revision",
                      fecha_desde or actualiza_desde,
                      fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition":
                             f'attachment; filename="{archivo}"'})
