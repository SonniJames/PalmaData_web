"""
PalmaData · Aplicación principal
Sirve el API y el frontend. Protege el shell: si no hay sesión, va al login.

Arrancar:
    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .core import config, db, security
from .core.modules_registry import modulos_activos
from .modules.auth.router import router as auth_router

app = FastAPI(title="PalmaData", version="1.0.0")

app.include_router(auth_router)


@app.get("/api/health")
def health():
    return {"app": "ok", "db": "ok" if db.ping() else "error"}


@app.get("/api/modulos")
def modulos(request: Request):
    """Lista de módulos activos para construir el menú. Requiere sesión."""
    if not security.usuario_actual(request):
        return {"ok": False, "modulos": []}
    return {"ok": True, "modulos": modulos_activos()}


# --- Páginas ---
@app.get("/")
def raiz(request: Request):
    """El shell. Si no hay sesión, redirige al login."""
    if not security.usuario_actual(request):
        return RedirectResponse(url="/login")
    return FileResponse(config.WEB_DIR / "app.html")


@app.get("/login")
def login_page(request: Request):
    """Página de login. Si ya hay sesión, entra directo."""
    if security.usuario_actual(request):
        return RedirectResponse(url="/")
    return FileResponse(config.WEB_DIR / "login.html")


# Archivos estáticos (css, js, imágenes)
app.mount("/core", StaticFiles(directory=str(config.WEB_DIR / "core")), name="core")
app.mount("/assets", StaticFiles(directory=str(config.WEB_DIR / "assets")), name="assets")
