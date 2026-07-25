"""Endpoints de autenticación."""
from fastapi import APIRouter, Form, Request, Response
from fastapi.responses import JSONResponse

from ...core import config, security

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(response: Response, usuario: str = Form(...), clave: str = Form(...)):
    datos = security.verificar_credenciales(usuario.strip(), clave)
    if not datos:
        return JSONResponse(
            status_code=401,
            content={"ok": False, "mensaje": "Usuario o contraseña incorrectos."},
        )

    token = security.crear_token(datos)
    resp = JSONResponse(content={"ok": True, "usuario": datos})
    resp.set_cookie(
        key=security.COOKIE_NAME,
        value=token,
        max_age=config.SESSION_MINUTES * 60,
        httponly=True,       # la cookie no es accesible desde JS (más seguro)
        samesite="lax",
    )
    return resp


@router.post("/logout")
def logout():
    resp = JSONResponse(content={"ok": True})
    resp.delete_cookie(security.COOKIE_NAME)
    return resp


@router.get("/me")
def me(request: Request):
    u = security.usuario_actual(request)
    if not u:
        return JSONResponse(status_code=401, content={"ok": False})
    return {"ok": True, "usuario": u}
