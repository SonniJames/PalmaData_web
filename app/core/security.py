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


# ============================================================
#  PERMISOS POR MÓDULO
# ============================================================
# La regla vive en la base (plantacion.web_puede). Aquí solo se consulta,
# con una caché corta: una pantalla dispara varias peticiones seguidas y
# no tiene sentido preguntar lo mismo cinco veces por segundo.
#
# La caché dura poco a propósito: si le quitas un permiso a alguien, deja
# de poder entrar en menos de un minuto, sin reiniciar nada.

_CACHE: dict[str, tuple[float, list[dict]]] = {}
_CACHE_SEGUNDOS = 30


def _permisos_crudos(usuario: str) -> list[dict]:
    ahora = time.time()
    guardado = _CACHE.get(usuario)
    if guardado and ahora - guardado[0] < _CACHE_SEGUNDOS:
        return guardado[1]
    try:
        filas = db.fetch_all(
            "SELECT modulo, apartado FROM plantacion.web_permisos_de(%s)", (usuario,))
    except Exception:
        # Si la tabla de permisos todavía no existe (script 45 sin ejecutar),
        # el sistema sigue funcionando como antes: abierto.
        filas = []
    _CACHE[usuario] = (ahora, filas)
    return filas


def modo_abierto() -> bool:
    """True mientras nadie haya definido permisos: nadie queda bloqueado."""
    ahora = time.time()
    guardado = _CACHE.get("__abierto__")
    if guardado and ahora - guardado[0] < _CACHE_SEGUNDOS:
        return guardado[1]
    try:
        fila = db.fetch_one("SELECT plantacion.web_modo_abierto() AS abierto")
        abierto = bool(fila and fila["abierto"])
    except Exception:
        abierto = True          # sin tabla de permisos, todo abierto
    _CACHE["__abierto__"] = (ahora, abierto)
    return abierto


def permisos(usuario: str) -> list[dict]:
    return _permisos_crudos(usuario)


def puede(usuario: str, modulo: str, apartado: str | None = None) -> bool:
    """
    ¿Puede este usuario abrir esto?

    Sin apartado se pregunta por el MÓDULO: basta con tener cualquier
    permiso dentro de él. Quien solo tiene «Tratamientos · revisión» debe
    ver Sanidad en el menú, aunque adentro solo le aparezca su apartado.

    Con apartado, la fila del módulo completo (apartado NULL) cubre todos
    los que tenga hoy y los que se agreguen después.
    """
    if modulo == "inicio":
        return True
    if modo_abierto():
        return True
    for p in _permisos_crudos(usuario):
        if p["modulo"] != modulo:
            continue
        if apartado is None:            # se pregunta por el módulo entero
            return True
        if p["apartado"] is None or p["apartado"] == apartado:
            return True
    return False


def limpiar_cache(usuario: str | None = None) -> None:
    """Tras otorgar o quitar, para que el cambio se note de inmediato."""
    if usuario:
        _CACHE.pop(usuario, None)
    else:
        _CACHE.clear()
    _CACHE.pop("__abierto__", None)
