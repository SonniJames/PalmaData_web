"""
PalmaData · Supervisión · Polinización · Endpoints
==================================================
Rutas bajo /api/supervision/poli. Todas exigen sesión.
Solo consulta y descarga: la tabla que se ve es la que se baja.

Se monta dentro del router de supervisión y reutiliza sus ayudantes.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from . import repository_poli as repo
from .router import XLSX, _excel, _fila, _limpiar, _nombre, sesion

router_poli = APIRouter(prefix="/poli", tags=["supervision-polinizacion"])

# Los tres valores que puede tomar el veredicto. "Sin comparar" es tan
# informativo como los otros dos: dice dónde no se pudo medir.
CUMPLE = ("Sí", "No", "Sin comparar")

COLUMNAS = [
    ("fecha", "FECHA"), ("lote", "LOTE"),
    ("linea", "LINEA"), ("palma", "PALMA"),
    ("polinizador", "POLINIZADOR"), ("supervisor", "SUPERVISOR"),
    ("reportada_ap1", "REPORTADA 1"), ("encontrada_ap1", "ENCONTRADA 1"),
    ("diferencia_ap1", "DIFERENCIA 1"),
    ("reportada_ap2", "REPORTADA 2"), ("encontrada_ap2", "ENCONTRADA 2"),
    ("diferencia_ap2", "DIFERENCIA 2"),
    ("reportada_ap3", "REPORTADA 3"), ("encontrada_ap3", "ENCONTRADA 3"),
    ("diferencia_ap3", "DIFERENCIA 3"),
    ("cumple", "CUMPLE"), ("origen_comparacion", "ORIGEN COMPARACION"),
    ("motivo_sin_comparar", "MOTIVO SIN COMPARAR"),
    ("hoja_sin_marcar", "HOJA SIN MARCAR"),
    ("espata_sin_abrir", "ESPATA SIN ABRIR"),
    ("mala_cobertura_aplicacion", "MALA COBERTURA"),
    ("espata_abierta", "ESPATA ABIERTA"),
    ("espata_parcial", "ESPATA PARCIAL"),
    ("observaciones", "OBSERVACIONES"),
]

ROLES = ("polinizador", "supervisor")


def _filtros(fecha_desde=None, fecha_hasta=None, actualiza_desde=None,
             actualiza_hasta=None, cat_lote_id=None, supervisor=None,
             polinizador=None, cumple=None, hoja=False, espata_sin=False,
             cobertura=False, espata_abierta=False, espata_parcial=False) -> dict:
    return {"fecha_desde": fecha_desde, "fecha_hasta": fecha_hasta,
            "actualiza_desde": actualiza_desde, "actualiza_hasta": actualiza_hasta,
            "cat_lote_id": cat_lote_id, "supervisor": supervisor,
            "polinizador": polinizador, "cumple": cumple,
            "hoja": hoja, "espata_sin": espata_sin, "cobertura": cobertura,
            "espata_abierta": espata_abierta, "espata_parcial": espata_parcial}


def _exigir_fecha(f: dict):
    if not any([f.get("fecha_desde"), f.get("fecha_hasta"),
                f.get("actualiza_desde"), f.get("actualiza_hasta")]):
        raise HTTPException(400, "Selecciona un rango de fechas: por fecha "
                                 "del evento o por fecha de actualización.")


def _validar_cumple(v):
    if v in (None, ""):
        return None
    if v not in CUMPLE:
        raise HTTPException(400, f"Cumple debe ser uno de: {', '.join(CUMPLE)}.")
    return v


@router_poli.get("/catalogos")
def get_catalogos(_=Depends(sesion)):
    return {"ok": True,
            "personas": {rol: [_fila(x) for x in repo.personas(rol)] for rol in ROLES},
            "lotes": [_fila(x) for x in repo.lotes()],
            "fechas": [_fila(x) for x in repo.fechas_disponibles()],
            "actualizaciones": [_fila(x) for x in repo.fechas_actualizacion()],
            "cumple": list(CUMPLE)}


@router_poli.get("")
def get_poli(fecha_desde: date | None = Query(None),
             fecha_hasta: date | None = Query(None),
             actualiza_desde: date | None = Query(None),
             actualiza_hasta: date | None = Query(None),
             cat_lote_id: int | None = Query(None),
             supervisor: int | None = Query(None),
             polinizador: int | None = Query(None),
             cumple: str | None = Query(None),
             hoja: bool = Query(False),
             espata_sin: bool = Query(False),
             cobertura: bool = Query(False),
             espata_abierta: bool = Query(False),
             espata_parcial: bool = Query(False),
             limite: int = Query(5000, ge=1, le=50000),
             _=Depends(sesion)):
    """
    Supervisión de polinización, con lo que reportó la trabajadora al lado
    de lo que encontró el supervisor y la diferencia entre ambos.
    """
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta,
                 cat_lote_id, supervisor, polinizador, _validar_cumple(cumple),
                 hoja, espata_sin, cobertura, espata_abierta, espata_parcial)
    _exigir_fecha(f)

    filas = repo.listar(f, limite)
    return {"ok": True, "filtros": {k: _limpiar(v) for k, v in f.items()},
            "total": len(filas), "limite": limite,
            "truncado": len(filas) >= limite,
            "columnas": [e for _c, e in COLUMNAS],
            "resumen": _fila(repo.resumen(f)),
            "registros": [_fila(x) for x in filas]}


@router_poli.get("/excel")
def get_poli_excel(fecha_desde: date | None = Query(None),
                   fecha_hasta: date | None = Query(None),
                   actualiza_desde: date | None = Query(None),
                   actualiza_hasta: date | None = Query(None),
                   cat_lote_id: int | None = Query(None),
                   supervisor: int | None = Query(None),
                   polinizador: int | None = Query(None),
                   cumple: str | None = Query(None),
                   hoja: bool = Query(False),
                   espata_sin: bool = Query(False),
                   cobertura: bool = Query(False),
                   espata_abierta: bool = Query(False),
                   espata_parcial: bool = Query(False),
                   _=Depends(sesion)):
    """La misma tabla que se ve en pantalla, en Excel."""
    f = _filtros(fecha_desde, fecha_hasta, actualiza_desde, actualiza_hasta,
                 cat_lote_id, supervisor, polinizador, _validar_cumple(cumple),
                 hoja, espata_sin, cobertura, espata_abierta, espata_parcial)
    _exigir_fecha(f)

    filas = repo.listar(f, 50000)
    if not filas:
        raise HTTPException(404, "No hay registros para esos filtros.")

    r = repo.resumen(f)
    nota = ("Supervisión de polinización\n"
            f"Fecha del evento: {fecha_desde or 'sin límite'} a {fecha_hasta or 'sin límite'}\n"
            f"Fecha de actualización: {actualiza_desde or 'sin límite'} "
            f"a {actualiza_hasta or 'sin límite'}\n"
            f"Registros: {len(filas)}\n"
            f"Cumple: {r.get('cumple_si')} · No cumple: {r.get('cumple_no')} · "
            f"Sin comparar: {r.get('sin_comparar')}\n"
            "\n"
            "DIFERENCIA = lo que encontró el supervisor menos lo que reportó\n"
            "la trabajadora. Negativo significa que ella reportó más.\n"
            "\n"
            "SIN COMPARAR no es un incumplimiento: es que no se pudo emparejar\n"
            "el registro de la trabajadora. El motivo va en su columna.\n"
            "ORIGEN COMPARACION dice cómo se emparejó: por orden (vínculo\n"
            "guardado por la app) o por palma (misma palma y polinizadora,\n"
            "dentro de los 3 días anteriores, con un solo candidato).")

    contenido = _excel("polinizacion", COLUMNAS, filas, nota)
    archivo = _nombre("supervision_polinizacion",
                      fecha_desde or actualiza_desde, fecha_hasta or actualiza_hasta)
    return Response(content=contenido, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{archivo}"'})
