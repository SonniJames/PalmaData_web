"""
PalmaData · Administración · Permisos · Repositorio
====================================================
Quién puede abrir qué. Las reglas están en la base (plantacion.web_*);
aquí solo se llaman.
"""
from ...core import db


def usuarios() -> list[dict]:
    return db.fetch_all("""
        SELECT user_id, usuario, nombre, cargo, activo, puede_entrar,
               permisos, modulos_completos, administra_permisos
        FROM plantacion.v_web_usuarios
        ORDER BY puede_entrar DESC, nombre NULLS LAST, usuario
    """)


def permisos_de(usuario: str) -> list[dict]:
    return db.fetch_all(
        "SELECT modulo, apartado FROM plantacion.web_permisos_de(%s)", (usuario,))


def todos() -> list[dict]:
    return db.fetch_all("""
        SELECT u.username AS usuario, p.modulo, p.apartado, p.otorgado_por, p.otorgado_at
        FROM plantacion.web_permiso p
        JOIN plantacion.users u ON u.id = p.user_id
        ORDER BY u.username, p.modulo, p.apartado NULLS FIRST
    """)


def modo_abierto() -> bool:
    fila = db.fetch_one("SELECT plantacion.web_modo_abierto() AS abierto")
    return bool(fila and fila["abierto"])


def otorgar(usuario: str, modulo: str, apartado: str | None, quien: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("""SELECT plantacion.web_permiso_otorgar(
                           %s::text, %s::text, %s::text, %s::text) AS n""",
                    (usuario, modulo, apartado, quien))
        return (cur.fetchone() or {}).get("n", 0)


def quitar(usuario: str, modulo: str, apartado: str | None) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.web_permiso_quitar(%s::text, %s::text, %s::text) AS n",
                    (usuario, modulo, apartado))
        return (cur.fetchone() or {}).get("n", 0)
