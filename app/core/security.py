"""
PalmaData · Sesiones
Maneja el login mediante una cookie firmada (itsdangerous).
No usamos JWT ni librerías pesadas: para una app interna,
una cookie de sesión firmada es simple y segura.
"""
import time

from fastapi import Request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from . import config, db

_serializer = URLSafeTimedSerializer(config.SECRET_KEY, salt="palmadata-session")

COOKIE_NAME = "palmadata_session"


def verificar_credenciales(usuario: str, clave: str) -> dict | None:
    """
    Comprueba usuario+contraseña contra la tabla reciblada.
    Usa crypt() de pgcrypto: la clave es correcta si el hash coincide.
    Devuelve datos del usuario si es válido, None si no.
    """
    tabla = f"{config.AUTH_SCHEMA}.{config.AUTH_TABLE}"
    sql = f"""
        SELECT {config.AUTH_USER_COL}  AS usuario,
               {config.AUTH_NAME_COL}  AS nombre,
               ({config.AUTH_PASS_COL} = crypt(%s, {config.AUTH_PASS_COL}))
                   AS clave_correcta
        FROM {tabla}
        WHERE {config.AUTH_USER_COL} = %s
          AND {config.AUTH_PASS_COL} IS NOT NULL
    """
    row = db.fetch_one(sql, (clave, usuario))
    if row and row.get("clave_correcta"):
        return {"usuario": row["usuario"], "nombre": row.get("nombre") or row["usuario"]}
    return None


def crear_token(datos: dict) -> str:
    payload = {"u": datos["usuario"], "n": datos["nombre"], "t": int(time.time())}
    return _serializer.dumps(payload)


def leer_token(token: str) -> dict | None:
    try:
        max_age = config.SESSION_MINUTES * 60
        payload = _serializer.loads(token, max_age=max_age)
        return {"usuario": payload["u"], "nombre": payload["n"]}
    except (BadSignature, SignatureExpired, KeyError):
        return None


def usuario_actual(request: Request) -> dict | None:
    """Lee la cookie de la petición y devuelve el usuario, o None."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    return leer_token(token)
