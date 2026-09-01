"""
PalmaData · Sanidad · Plagas · Endpoints
========================================
Rutas bajo /api/sanidad/plagas. Todas exigen sesión.

Espejo de los endpoints del censo sobre sanplagaslectura: con el análisis
de erróneos (palma inexistente), sin duplicados, y con la descarga del
consolidado filtrable por fecha del evento o de actualización.

Los ayudantes de sesión, filtros y Excel se reutilizan del router del
censo: son el mismo módulo (sanidad) y son idénticos a propósito.
"""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response

from . import repository_plagas as repo
from .router import (XLSX, _excel, _exigir_fecha, _fila, _filtros, _ids,
                     _limpiar, _nombre, _quien, sesion)

# Prefijo RELATIVO: este router se monta dentro del de sanidad, que ya
# aporta /api/sanidad. Las rutas finales quedan en /api/sanidad/plagas/...
router_plagas = APIRouter(prefix="/plagas", tags=["sanidad-plagas"])


# ============================================================
#  CATÁLOGOS
# ============================================================

@router_plagas.get("/catalogos")
def get_catalogos(_=Depends(sesion)):
    """Insectos, estados, evaluadores y fechas para filtros y modal."""
    return {"ok": True,
            "insectos": repo.listar_insectos(),
            "estados": repo.listar_estados_insecto(),
            "evaluadores": [_fila(x) for x in repo.listar_evaluadores()],
            "fechas": [_fila(x) for x in repo.fechas_disponibles()],
            "actualizaciones": [_fila(x) for x in repo.fechas_actualizacion()]}


@router_plagas.get("/lotes")
def get_lotes(q: str | None = Query(None, description="Nombre o número"),
              limite: int = Query(500, ge=1, le=2000), _=Depends(sesion)):
    return {"ok": True, "lotes": repo.listar_lotes(q, limite)}


# ============================================================
#  REVISIÓN
# ============================================================

@router_plagas.get("/revision")
def get_revision(fecha_desde: date | None = Query(None),
                 fecha_hasta: date | None = Query(None),
                 actualiza_desde: date | None = Query(None),
                 actualiza_hasta: date | None = Query(None),
                 cat_lote_id: int | None = Query(None),
                 evaluador: int | None = Query(None),
                 ver_anulados: bool = Query(False),
                 solo_erroneos: bool = Query(False),
                 limite: int = Query(1000, ge=1, le=10000),
                 _=Depends(sesion)):
    """Las lecturas de plagas para revisar y corregir."""
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde,
                 actualiza_hasta, cat_lote_id, evaluador)
    _exigir_fecha(f)

    filas = repo.revision(f, ver_anulados, solo_erroneos, limite)
    return {"ok": True, "filtros": {k: _limpiar(v) for k, v in f.items()},
            "total": len(filas), "limite": limite,
            "truncado": len(filas) >= limite,
            "resumen": _fila(repo.resumen(f)),
            "registros": [_fila(x) for x in filas]}


# ============================================================
#  CORRECCIONES
# ============================================================

@router_plagas.post("/corregir-lote")
def post_corregir_lote(datos: dict = Body(...), usuario=Depends(sesion)):
    """Cambia el lote de uno o varios registros a la vez."""
    ids = _ids(datos)
    cat_lote_id = datos.get("cat_lote_id")
    if not cat_lote_id:
        raise HTTPException(400, "Selecciona el lote correcto.")
    try:
        n = repo.corregir_lote(ids, int(cat_lote_id), _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


CAMPOS_EDITABLES = ("cat_lote_id", "linea", "palma", "insectoid",
                    "estadoinsectoid", "cantidad", "nivfoliar",
                    "defol5", "defol13", "defol21", "defol29", "defol37",
                    "observaciones")


@router_plagas.post("/corregir")
def post_corregir(datos: dict = Body(...), usuario=Depends(sesion)):
    """
    Corrige un registro campo a campo. Lo que no se envía queda como
    estaba. Lectura, fecha, hora y evaluador no se editan.
    """
    id_registro = datos.get("id")
    if not id_registro:
        raise HTTPException(400, "Falta el registro a corregir.")

    campos = {k: datos.get(k) for k in CAMPOS_EDITABLES}
    if all(v in (None, "") for v in campos.values()):
        raise HTTPException(400, "No se envió ningún cambio.")
    campos = {k: (None if v in (None, "") else v) for k, v in campos.items()}

    try:
        n = repo.corregir_registro(int(id_registro), _quien(usuario), campos)
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


@router_plagas.post("/anular")
def post_anular(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    try:
        n = repo.anular(ids, _quien(usuario), datos.get("motivo"))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "anulados": n}


@router_plagas.post("/reactivar")
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
    ("lectura", "LECTURA"), ("fecha", "FECHA"), ("hora", "HORA"),
    ("lote", "LOTE"), ("linea", "LINEA"), ("palma", "PALMA"),
    ("insecto", "INSECTO"), ("estado", "ESTADO"), ("cantidad", "CANTIDAD"),
    ("nivfoliar", "NIVEL FOLIAR"),
    ("defol5", "HOJA 5"), ("defol13", "HOJA 13"), ("defol21", "HOJA 21"),
    ("defol29", "HOJA 29"), ("defol37", "HOJA 37"),
    ("evaluador", "EVALUADOR"), ("observaciones", "OBSERVACIONES"),
    ("geom", "GEOM"),   # geometría en texto WKT
]


def _exigir_fecha_descarga(fd, fh, ad, ah):
    if not any([fd, fh, ad, ah]):
        raise HTTPException(400, "Selecciona un rango de fechas: por fecha "
                                 "del evento o por fecha de actualización.")


@router_plagas.get("/consolidado")
def get_consolidado(fecha_desde: date | None = Query(None),
                    fecha_hasta: date | None = Query(None),
                    actualiza_desde: date | None = Query(None),
                    actualiza_hasta: date | None = Query(None),
                    _=Depends(sesion)):
    """Vista previa del consolidado antes de descargarlo."""
    _exigir_fecha_descarga(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    filas = repo.consolidado(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    return {"ok": True, "total": len(filas),
            "columnas": [e for _c, e in COLUMNAS_CONSOLIDADO],
            "registros": [_fila(x) for x in filas[:500]]}


@router_plagas.get("/consolidado/excel")
def get_consolidado_excel(fecha_desde: date | None = Query(None),
                          fecha_hasta: date | None = Query(None),
                          actualiza_desde: date | None = Query(None),
                          actualiza_hasta: date | None = Query(None),
                          _=Depends(sesion)):
    """
    Descarga el consolidado de plagas con las correcciones aplicadas.
    No incluye anulados; los erróneos sí van.
    """
    _exigir_fecha_descarga(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    filas = repo.consolidado(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    if not filas:
        raise HTTPException(404, "No hay registros para esas fechas.")

    nota = ("Consolidado de plagas\n"
            f"Fecha del evento: {fecha_desde or 'sin límite'} a {fecha_hasta or 'sin límite'}\n"
            f"Fecha de actualización: {actualiza_desde or 'sin límite'} "
            f"a {actualiza_hasta or 'sin límite'}\n"
            f"Registros: {len(filas)}\n"
            "No incluye los anulados. GEOM va en texto WKT: POINT(longitud latitud).")

    contenido = _excel("consolidado", COLUMNAS_CONSOLIDADO, filas, nota)
    archivo = _nombre("plagas_consolidado",
                      fecha_desde or actualiza_desde, fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})


@router_plagas.get("/revision/excel")
def get_revision_excel(fecha_desde: date | None = Query(None),
                       fecha_hasta: date | None = Query(None),
                       actualiza_desde: date | None = Query(None),
                       actualiza_hasta: date | None = Query(None),
                       cat_lote_id: int | None = Query(None),
                       evaluador: int | None = Query(None),
                       ver_anulados: bool = Query(False),
                       solo_erroneos: bool = Query(False),
                       _=Depends(sesion)):
    """La tabla de revisión tal como se ve en pantalla."""
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde,
                 actualiza_hasta, cat_lote_id, evaluador)
    _exigir_fecha(f)

    filas = repo.revision(f, ver_anulados, solo_erroneos, 10000)
    columnas = [("lectura", "Lectura"), ("fecha", "Fecha"), ("hora", "Hora"),
                ("lote", "Lote"), ("linea", "Linea"), ("palma", "Palma"),
                ("insecto", "Insecto"), ("estado_insecto", "Estado"),
                ("cantidad", "Cantidad"), ("nivfoliar", "Nivel foliar"),
                ("defol5", "Hoja 5"), ("defol13", "Hoja 13"),
                ("defol21", "Hoja 21"), ("defol29", "Hoja 29"),
                ("defol37", "Hoja 37"),
                ("trabajador", "Evaluador"), ("observaciones", "Observaciones"),
                ("erroneo", "Palma inexistente"),
                ("fecha_actualizacion", "Fecha actualización"),
                ("corregido_por", "Corregido por"), ("corregido_at", "Corregido el"),
                ("anulado_por", "Anulado por"), ("id_unico", "ID_unico")]

    nota = ("Revisión de plagas\n"
            f"Fecha del evento: {fecha_desde or '—'} a {fecha_hasta or '—'}\n"
            f"Fecha de actualización: {actualiza_desde or '—'} a {actualiza_hasta or '—'}\n"
            + ("Solo palmas inexistentes\n" if solo_erroneos else "")
            + ("Solo anulados\n" if ver_anulados else "")
            + f"Registros: {len(filas)}")

    contenido = _excel("revision", columnas, filas, nota)
    archivo = _nombre("plagas_revision",
                      fecha_desde or actualiza_desde, fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})
