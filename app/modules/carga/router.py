"""
PalmaData · Cargar datos · Endpoints
====================================
Rutas bajo /api/carga. Todas exigen sesión.

Sube los Excel que genera la app cuando no hay internet. Cada archivo se
procesa por separado y en su propia transacción: si uno falla, los demás
entran igual. Eso importa cuando se suben diez o quince de una vez.
"""
from datetime import date, datetime

from fastapi import (APIRouter, Depends, File, HTTPException, Query, Request,
                     UploadFile)

from ...core import security
from . import repository as repo
from .tablas import NO_SOPORTADAS, TABLAS, tabla_de_archivo

router = APIRouter(prefix="/api/carga", tags=["carga"])

# Un archivo de tracks de un día ronda las mil filas; 25 MB deja margen de
# sobra y evita que un archivo equivocado tumbe el servidor.
MAX_BYTES = 25 * 1024 * 1024


def sesion(request: Request) -> dict:
    usuario = security.usuario_actual(request)
    if not usuario:
        raise HTTPException(401, "Sesión no iniciada.")
    return usuario


def _limpiar(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, date):
        return v.isoformat()
    if hasattr(v, "quantize"):
        return float(v)
    return v


def _fila(f: dict) -> dict:
    return {k: _limpiar(v) for k, v in f.items()}


def _orden(archivo: UploadFile) -> tuple:
    """
    Para procesar en el orden en que la app generó los archivos: primero
    por fecha, luego por el número final del nombre. Lo que no siga el
    patrón va al final, pero se procesa igual.
    """
    _t, fecha, num = tabla_de_archivo(archivo.filename or "")
    return (fecha or "99999999", num if num is not None else 9999,
            archivo.filename or "")


@router.get("/tablas")
def get_tablas(_=Depends(sesion)):
    """Qué archivos acepta el módulo y cuál es la columna anti-duplicados."""
    return {"ok": True,
            "tablas": [{"tabla": t, "conflicto": c["conflicto"]}
                       for t, c in sorted(TABLAS.items())],
            "no_soportadas": [{"tabla": t, "motivo": m}
                              for t, m in sorted(NO_SOPORTADAS.items())]}


@router.post("/subir")
async def post_subir(archivos: list[UploadFile] = File(...),
                     usuario=Depends(sesion)):
    """
    Carga uno o varios Excel. Devuelve el resultado de cada uno por
    separado: un archivo con problemas no impide que los demás entren.
    """
    if not archivos:
        raise HTTPException(400, "No se recibió ningún archivo.")

    quien = usuario["usuario"]
    resultados = []

    for archivo in sorted(archivos, key=_orden):
        nombre = archivo.filename or "(sin nombre)"
        r = {"archivo": nombre, "tabla": None, "estado": "error",
             "leidas": 0, "nuevas": 0, "repetidas": 0,
             "ignoradas": [], "mensaje": ""}

        try:
            contenido = await archivo.read()

            if not contenido:
                r["mensaje"] = "El archivo llegó vacío."
                resultados.append(r); continue

            if len(contenido) > MAX_BYTES:
                r["mensaje"] = (f"El archivo pesa {len(contenido) // 1024 // 1024} MB "
                                f"y el límite son {MAX_BYTES // 1024 // 1024} MB.")
                resultados.append(r); continue

            if not nombre.lower().endswith((".xlsx", ".xlsm")):
                r["mensaje"] = "Solo se aceptan archivos .xlsx."
                resultados.append(r); continue

            tabla, _fecha, _num = tabla_de_archivo(nombre)
            r["tabla"] = tabla

            if tabla in NO_SOPORTADAS:
                r["estado"] = "omitido"
                r["mensaje"] = NO_SOPORTADAS[tabla]
                resultados.append(r); continue

            if tabla not in TABLAS:
                r["mensaje"] = (f"No reconozco la tabla «{tabla}». El nombre del "
                                f"archivo debe empezar por el nombre de la tabla, "
                                f"como san_enf_lectura_20260904_1.xlsx.")
                resultados.append(r); continue

            # ¿Este mismo contenido ya se cargó?
            hash_archivo = repo.huella(contenido)
            previa = repo.carga_previa(hash_archivo)

            encabezados, filas = repo.leer_excel(contenido)
            r["leidas"] = len(filas)

            if not encabezados:
                r["mensaje"] = "La hoja está vacía: no tiene ni encabezados."
                repo.anotar(nombre, tabla or "?", hash_archivo, 0, 0, 0, [],
                            "error", r["mensaje"], quien)
                resultados.append(r); continue

            if not filas:
                r["estado"] = "vacio"
                r["mensaje"] = "El archivo no tiene filas con datos."
                repo.anotar(nombre, tabla, hash_archivo, 0, 0, 0, [],
                            "ok", r["mensaje"], quien)
                resultados.append(r); continue

            columnas_bd = repo.columnas_de_tabla(tabla)
            if not columnas_bd:
                r["mensaje"] = f"La tabla plantacion.{tabla} no existe en la base."
                repo.anotar(nombre, tabla, hash_archivo, len(filas), 0, 0, [],
                            "error", r["mensaje"], quien)
                resultados.append(r); continue

            mapa, desconocidas = repo.mapear(encabezados, columnas_bd)
            r["ignoradas"] = desconocidas

            conflicto = TABLAS[tabla]["conflicto"]
            if conflicto not in mapa.values():
                r["mensaje"] = (f"El archivo no trae la columna «{conflicto}», que es "
                                f"la que evita duplicar registros. Sin ella no se "
                                f"puede cargar con seguridad.")
                repo.anotar(nombre, tabla, hash_archivo, len(filas), 0, 0,
                            desconocidas, "error", r["mensaje"], quien)
                resultados.append(r); continue

            nuevas, repetidas = repo.insertar(tabla, mapa, filas, columnas_bd)
            r.update(estado="ok", nuevas=nuevas, repetidas=repetidas)

            partes = []
            if previa:
                partes.append(
                    f"Este archivo ya se había cargado el "
                    f"{_limpiar(previa['cargado_at'])} por {previa['cargado_por']}.")
            if repetidas:
                partes.append(f"{repetidas} fila(s) ya estaban en la base y no se "
                              f"volvieron a insertar.")
            if desconocidas:
                partes.append("Columnas del Excel que no existen en la tabla y no "
                              "se cargaron: " + ", ".join(desconocidas) + ".")
            r["mensaje"] = " ".join(partes) or "Todo entró sin novedad."

            repo.anotar(nombre, tabla, hash_archivo, len(filas), nuevas,
                        repetidas, desconocidas, "ok", r["mensaje"], quien)

        except Exception as e:
            # Un archivo con problemas no debe tumbar los demás.
            detalle = str(e).split("\n")[0][:400]
            r["mensaje"] = detalle
            try:
                repo.anotar(nombre, r["tabla"] or "?",
                            repo.huella(contenido) if 'contenido' in dir() else "",
                            r["leidas"], 0, 0, r["ignoradas"], "error", detalle, quien)
            except Exception:
                pass   # si ni la bitácora se puede escribir, seguimos igual

        resultados.append(r)

    total = {
        "archivos": len(resultados),
        "ok": sum(1 for x in resultados if x["estado"] == "ok"),
        "con_error": sum(1 for x in resultados if x["estado"] == "error"),
        "nuevas": sum(x["nuevas"] for x in resultados),
        "repetidas": sum(x["repetidas"] for x in resultados),
    }
    return {"ok": True, "total": total, "resultados": resultados}


@router.get("/historial")
def get_historial(limite: int = Query(100, ge=1, le=1000), _=Depends(sesion)):
    """Qué se ha cargado, cuándo y con qué resultado."""
    return {"ok": True,
            "resumen": _fila(repo.resumen_historial()),
            "registros": [_fila(x) for x in repo.historial(limite)]}
