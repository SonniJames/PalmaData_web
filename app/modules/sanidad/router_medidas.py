"""
PalmaData · Sanidad · Medidas vegetativas · Endpoints
=====================================================
Rutas bajo /api/sanidad/medidas. Todas exigen sesión.

Un solo apartado: la revisión y la descarga van en la misma pantalla, y el
Excel baja exactamente la tabla que se ve, con los mismos filtros.
"""
from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response

from . import repository_medidas as repo
from .router import XLSX, _excel, _exigir_fecha, _fila, _ids, _limpiar, _nombre, _quien, sesion

router_medidas = APIRouter(prefix="/medidas", tags=["sanidad-medidas"])

# La tabla de la pantalla y la del Excel, en el mismo orden que pediste.
COLUMNAS = [
    ("fecha", "FECHA"), ("hora", "HORA"), ("evaluador", "EVALUADOR"),
    ("lote", "LOTE"), ("linea", "LINEA"), ("palma", "PALMA"), ("uma", "UMA"),
    ("num_foliolos", "NUM FOLIOLOS"),
    ("long_peciolo", "LONGITUD DE PECIOLO"), ("anch_peciolo", "ANCHO DE PECIOLO"),
    ("prof_peciolo", "PROFUNDIDAD DE PECIOLO"), ("long_raquis", "LONGITUD DE RAQUIS"),
] + [(f"{t}_{n}", f"{t.upper()} {n}") for n in range(1, 9) for t in ("ancho", "largo")] + [
    ("hoja", "HOJA"), ("hojas_verdes", "HOJAS VERDES"),
    ("latitud", "LATITUD"), ("longitud", "LONGITUD"), ("geom", "GEOM"),
]


def _filtros(fecha_desde=None, fecha_hasta=None, actualiza_desde=None,
             actualiza_hasta=None, cat_lote_id=None, evaluador=None,
             nut_uma_id=None) -> dict:
    return {"fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta,
            "actualiza_desde": actualiza_desde, "actualiza_hasta": actualiza_hasta,
            "cat_lote_id": cat_lote_id, "evaluador": evaluador,
            "nut_uma_id": nut_uma_id}


# ============================================================
#  CATÁLOGOS
# ============================================================

@router_medidas.get("/catalogos")
def get_catalogos(_=Depends(sesion)):
    return {"ok": True,
            "evaluadores": [_fila(x) for x in repo.listar_evaluadores()],
            "umas": [_fila(x) for x in repo.listar_umas_con_datos()],
            "fechas": [_fila(x) for x in repo.fechas_disponibles()],
            "actualizaciones": [_fila(x) for x in repo.fechas_actualizacion()]}


@router_medidas.get("/lotes")
def get_lotes(q: str | None = Query(None), limite: int = Query(500, ge=1, le=2000),
              _=Depends(sesion)):
    return {"ok": True, "lotes": repo.listar_lotes(q, limite)}


@router_medidas.get("/umas")
def get_umas(q: str | None = Query(None), limite: int = Query(500, ge=1, le=2000),
             _=Depends(sesion)):
    """Todas las UMA del catálogo, para el buscador del modal."""
    return {"ok": True, "umas": repo.buscar_umas(q, limite)}


# ============================================================
#  REVISIÓN
# ============================================================

@router_medidas.get("/revision")
def get_revision(fecha_desde: date | None = Query(None),
                 fecha_hasta: date | None = Query(None),
                 actualiza_desde: date | None = Query(None),
                 actualiza_hasta: date | None = Query(None),
                 cat_lote_id: int | None = Query(None),
                 evaluador: int | None = Query(None),
                 nut_uma_id: int | None = Query(None),
                 ver_anulados: bool = Query(False),
                 solo_erroneos: bool = Query(False),
                 limite: int = Query(1000, ge=1, le=5000),
                 _=Depends(sesion)):
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta,
                 cat_lote_id, evaluador, nut_uma_id)
    _exigir_fecha(f)
    filas = repo.revision(f, ver_anulados, solo_erroneos, limite)
    return {"ok": True, "filtros": {k: _limpiar(v) for k, v in f.items()},
            "ver_anulados": ver_anulados, "solo_erroneos": solo_erroneos,
            "total": len(filas), "limite": limite, "truncado": len(filas) >= limite,
            "resumen": _fila(repo.resumen(f)),
            "registros": [_fila(x) for x in filas]}


# ============================================================
#  CORRECCIONES
# ============================================================

@router_medidas.post("/corregir-lote")
def post_corregir_lote(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    lote = datos.get("cat_lote_id")
    if not lote:
        raise HTTPException(400, "Falta el lote.")
    try:
        n = repo.corregir_lote(ids, int(lote), _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


@router_medidas.post("/corregir")
def post_corregir(datos: dict = Body(...), usuario=Depends(sesion)):
    """Un registro: lote, línea, palma y UMA. Lo que no se envía queda igual."""
    id_registro = datos.get("id")
    if not id_registro:
        raise HTTPException(400, "Falta el registro a corregir.")

    def entero(clave):
        v = datos.get(clave)
        if v in (None, ""):
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            raise HTTPException(400, f"«{clave}» debe ser un número entero.")

    campos = {"cat_lote_id": entero("cat_lote_id"), "linea": entero("linea"),
              "palma": entero("palma"), "nut_uma_id": entero("nut_uma_id")}
    if all(v is None for v in campos.values()):
        raise HTTPException(400, "No se envió ningún cambio.")
    try:
        n = repo.corregir_registro(int(id_registro), _quien(usuario), campos)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "corregidos": n}


@router_medidas.post("/anular")
def post_anular(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    try:
        n = repo.anular(ids, _quien(usuario), datos.get("motivo"))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "anulados": n}


@router_medidas.post("/reactivar")
def post_reactivar(datos: dict = Body(...), usuario=Depends(sesion)):
    ids = _ids(datos)
    try:
        n = repo.reactivar(ids, _quien(usuario))
    except Exception as e:
        raise HTTPException(400, str(e).split("\n")[0])
    return {"ok": True, "reactivados": n}


# ============================================================
#  DESCARGA · la misma tabla que se ve en pantalla
# ============================================================

@router_medidas.get("/excel")
def get_excel(fecha_desde: date | None = Query(None),
              fecha_hasta: date | None = Query(None),
              actualiza_desde: date | None = Query(None),
              actualiza_hasta: date | None = Query(None),
              cat_lote_id: int | None = Query(None),
              evaluador: int | None = Query(None),
              nut_uma_id: int | None = Query(None),
              ver_anulados: bool = Query(False),
              solo_erroneos: bool = Query(False),
              _=Depends(sesion)):
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta,
                 cat_lote_id, evaluador, nut_uma_id)
    _exigir_fecha(f)
    filas = repo.para_excel(f, ver_anulados, solo_erroneos)
    if not filas:
        raise HTTPException(404, "No hay registros para esos filtros.")

    r = repo.resumen(f)
    nota = ("Medidas vegetativas\n"
            f"Fecha del evento: {fecha_desde or 'sin límite'} a {fecha_hasta or 'sin límite'}\n"
            f"Fecha de actualización: {actualiza_desde or 'sin límite'} a {actualiza_hasta or 'sin límite'}\n"
            f"Registros: {len(filas)} · erróneos: {r.get('erroneos')} · anulados: {r.get('anulados')}\n"
            + ("Solo registros anulados.\n" if ver_anulados else "")
            + ("Solo registros con palma inexistente.\n" if solo_erroneos else "")
            + "Es la misma tabla que se ve en pantalla, con los mismos filtros.")
    contenido = _excel("medidas", COLUMNAS, filas, nota)
    archivo = _nombre("medidas_vegetativas",
                      fecha_desde or actualiza_desde, fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})
