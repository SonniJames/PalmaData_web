"""
PalmaData · Aplicación principal
================================
Sirve el API y el frontend.

AISLAMIENTO DE MÓDULOS
----------------------
Cada módulo se carga por separado dentro de un try/except. Si uno falla
(error de sintaxis, dependencia faltante, tabla que no existe), se registra
el problema y la aplicación sigue arrancando sin él. El login y los demás
módulos no se ven afectados.

El estado de cada módulo se consulta en /api/estado

Arrancar:
    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
import importlib
import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .core import config, db, security
from .core.modules_registry import modulos_activos
from .modules.auth.router import router as auth_router

log = logging.getLogger("palmadata")

app = FastAPI(title="PalmaData", version="1.2.0")

# --- Autenticación: es el núcleo, se carga siempre ---
app.include_router(auth_router)


# ============================================================
#  MÓDULOS · cada uno aislado del resto
# ============================================================
# Para añadir un módulo: agrega su id aquí y crea
#   app/modules/<id>/router.py  con una variable `router`
MODULOS_BACKEND = [
    "fertilizacion",
    "asistencia",
    "sanidad",
    "produccion",
]

ESTADO_MODULOS: dict[str, dict] = {}


def _cargar_modulos():
    for nombre in MODULOS_BACKEND:
        try:
            modulo = importlib.import_module(f".modules.{nombre}.router", __package__)
            app.include_router(modulo.router)
            ESTADO_MODULOS[nombre] = {"ok": True, "error": None}
            log.info("Modulo '%s' cargado.", nombre)
        except Exception as e:
            ESTADO_MODULOS[nombre] = {
                "ok": False,
                "error": f"{type(e).__name__}: {e}",
                "detalle": traceback.format_exc(limit=3),
            }
            log.error("El modulo '%s' no se pudo cargar: %s", nombre, e)
            log.error(traceback.format_exc())


_cargar_modulos()


# ============================================================
#  ESTADO
# ============================================================

@app.get("/api/health")
def health():
    return {
        "app": "ok",
        "db": "ok" if db.ping() else "error",
        "modulos_cargados": [n for n, e in ESTADO_MODULOS.items() if e["ok"]],
        "modulos_con_error": [n for n, e in ESTADO_MODULOS.items() if not e["ok"]],
    }


@app.get("/api/estado")
def estado(request: Request):
    """Diagnostico de modulos. Muestra el error de los que no cargaron."""
    if not security.usuario_actual(request):
        return {"ok": False, "mensaje": "Sesion no iniciada."}
    return {"ok": True, "db": db.ping(), "modulos": ESTADO_MODULOS}


@app.get("/api/modulos")
def modulos(request: Request):
    """
    Modulos para el menu. Un modulo cuyo backend no cargo se marca con
    disponible=False: el menu lo muestra pero avisa del problema, en vez
    de fallar en silencio.
    """
    if not security.usuario_actual(request):
        return {"ok": False, "modulos": []}

    salida = []
    for m in modulos_activos():
        item = dict(m)
        est = ESTADO_MODULOS.get(m["id"])
        if est is None:
            item["disponible"] = True          # modulo sin backend (ej. Inicio)
        else:
            item["disponible"] = est["ok"]
            if not est["ok"]:
                item["error"] = est["error"]
        salida.append(item)

    return {"ok": True, "modulos": salida}


# ============================================================
#  PAGINAS
# ============================================================

@app.get("/")
def raiz(request: Request):
    if not security.usuario_actual(request):
        return RedirectResponse(url="/login")
    return FileResponse(config.WEB_DIR / "app.html")


@app.get("/login")
def login_page(request: Request):
    if security.usuario_actual(request):
        return RedirectResponse(url="/")
    return FileResponse(config.WEB_DIR / "login.html")


# ============================================================
#  ARCHIVOS ESTATICOS
# ============================================================
app.mount("/core", StaticFiles(directory=str(config.WEB_DIR / "core")), name="core")
app.mount("/assets", StaticFiles(directory=str(config.WEB_DIR / "assets")), name="assets")
app.mount("/modules", StaticFiles(directory=str(config.WEB_DIR / "modules")), name="modules")
