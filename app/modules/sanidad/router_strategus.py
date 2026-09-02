"""
PalmaData · Sanidad · Strategus · Endpoints
===========================================
Rutas bajo /api/sanidad/strategus. Todas exigen sesión.
Con erróneos, sin duplicados. Corrección múltiple (solo lote) y unitaria
(lote, línea, palma, galerías). El sector se deriva del lote.
"""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response

from . import repository_strategus as repo
from .router import (XLSX, _excel, _exigir_fecha, _fila, _filtros, _ids,
                     _limpiar, _nombre, _quien, sesion)

# Prefijo RELATIVO: se monta dentro del router de sanidad (/api/sanidad).
router_strategus = APIRouter(prefix="/strategus", tags=["sanidad-strategus"])


# ============================================================
#  CATÁLOGOS
# ============================================================

@router_strategus.get("/catalogos")
def get_catalogos(_=Depends(sesion)):
    return {"ok": True,
            "evaluadores": [_fila(x) for x in repo.listar_evaluadores()],
            "fechas": [_fila(x) for x in repo.fechas_disponibles()],
            "actualizaciones": [_fila(x) for x in repo.fechas_actualizacion()]}


@router_strategus.get("/lotes")
def get_lotes(q: str | None = Query(None), limite: int = Query(500, ge=1, le=2000),
              _=Depends(sesion)):
    """Lotes con su sector, para el filtro y el modal."""
    return {"ok": True, "lotes": repo.listar_lotes(q, limite)}


# ============================================================
#  REVISIÓN
# ============================================================

@router_strategus.get("/revision")
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

@router_strategus.post("/corregir-lote")
def post_corregir_lote(datos: dict = Body(...), usuario=Depends(sesion)):
    """Cambia el lote de uno o varios registros; el sector sigue al lote."""
    ids = _ids(datos)
    cat_lote_id = datos.get("cat_lote_id")
    if not cat_lote_id:
        raise HTTPException(400, "Selecciona el lote correcto.")
    try:
        n = repo.corregir_lote(ids, int(cat_lote_id), _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


CAMPOS_EDITABLES = ("cat_lote_id", "linea", "palma", "galerias")


@router_strategus.post("/corregir")
def post_corregir(datos: dict = Body(...), usuario=Depends(sesion)):
    """Corrige un registro: lote, línea, palma y galerías."""
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


@router_strategus.post("/anular")
def post_anular(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    try:
        n = repo.anular(ids, _quien(usuario), datos.get("motivo"))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "anulados": n}


@router_strategus.post("/reactivar")
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
    ("sector", "SECTOR"), ("lote", "LOTE"), ("lectura", "LECTURA"),
    ("fecha", "FECHA"), ("linea", "LINEA"), ("palma", "PALMA"),
    ("galerias", "GALERIAS"), ("evaluador", "EVALUADOR"),
    ("geom", "GEOM"),   # geometría en texto WKT
]


def _exigir_fecha_descarga(fd, fh, ad, ah):
    if not any([fd, fh, ad, ah]):
        raise HTTPException(400, "Selecciona un rango de fechas: por fecha "
                                 "del evento o por fecha de actualización.")


@router_strategus.get("/consolidado")
def get_consolidado(fecha_desde: date | None = Query(None),
                    fecha_hasta: date | None = Query(None),
                    actualiza_desde: date | None = Query(None),
                    actualiza_hasta: date | None = Query(None),
                    _=Depends(sesion)):
    _exigir_fecha_descarga(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    filas = repo.consolidado(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    return {"ok": True, "total": len(filas),
            "columnas": [e for _c, e in COLUMNAS_CONSOLIDADO],
            "registros": [_fila(x) for x in filas[:500]]}


@router_strategus.get("/consolidado/excel")
def get_consolidado_excel(fecha_desde: date | None = Query(None),
                          fecha_hasta: date | None = Query(None),
                          actualiza_desde: date | None = Query(None),
                          actualiza_hasta: date | None = Query(None),
                          _=Depends(sesion)):
    _exigir_fecha_descarga(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    filas = repo.consolidado(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta)
    if not filas:
        raise HTTPException(404, "No hay registros para esas fechas.")

    nota = ("Consolidado de Strategus\n"
            f"Fecha del evento: {fecha_desde or 'sin límite'} a {fecha_hasta or 'sin límite'}\n"
            f"Fecha de actualización: {actualiza_desde or 'sin límite'} "
            f"a {actualiza_hasta or 'sin límite'}\n"
            f"Registros: {len(filas)}\n"
            "No incluye los anulados. GEOM va en texto WKT: POINT(longitud latitud).")

    contenido = _excel("consolidado", COLUMNAS_CONSOLIDADO, filas, nota)
    archivo = _nombre("strategus_consolidado",
                      fecha_desde or actualiza_desde, fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})


@router_strategus.get("/revision/excel")
def get_revision_excel(fecha_desde: date | None = Query(None),
                       fecha_hasta: date | None = Query(None),
                       actualiza_desde: date | None = Query(None),
                       actualiza_hasta: date | None = Query(None),
                       cat_lote_id: int | None = Query(None),
                       evaluador: int | None = Query(None),
                       ver_anulados: bool = Query(False),
                       solo_erroneos: bool = Query(False),
                       _=Depends(sesion)):
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde,
                 actualiza_hasta, cat_lote_id, evaluador)
    _exigir_fecha(f)

    filas = repo.revision(f, ver_anulados, solo_erroneos, 10000)
    columnas = [("sector", "Sector"), ("lote", "Lote"), ("lectura", "Lectura"),
                ("fecha", "Fecha"), ("linea", "Linea"), ("palma", "Palma"),
                ("galerias", "Galerias"), ("trabajador", "Evaluador"),
                ("erroneo", "Palma inexistente"),
                ("fecha_actualizacion", "Fecha actualización"),
                ("corregido_por", "Corregido por"), ("corregido_at", "Corregido el"),
                ("anulado_por", "Anulado por"), ("id_unico", "ID_unico")]

    nota = ("Revisión de Strategus\n"
            f"Fecha del evento: {fecha_desde or '—'} a {fecha_hasta or '—'}\n"
            f"Fecha de actualización: {actualiza_desde or '—'} a {actualiza_hasta or '—'}\n"
            + ("Solo palmas inexistentes\n" if solo_erroneos else "")
            + ("Solo anulados\n" if ver_anulados else "")
            + f"Registros: {len(filas)}")

    contenido = _excel("revision", columnas, filas, nota)
    archivo = _nombre("strategus_revision",
                      fecha_desde or actualiza_desde, fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})
