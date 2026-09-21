"""
PalmaData · Administración · Tratamientos · Químicos · Repositorio
==================================================================
Dos maestros que usan los tratamientos: categoria_producto y producto.
Crear, desactivar (estado = 0) y reactivar. Nada se borra: los tratamientos
ya registrados siguen apuntando a su producto aunque se desactive.
"""
from ...core import db


def categorias() -> list[dict]:
    return db.fetch_all("""
        SELECT categoria_producto_id, categoria, activa, productos_activos, productos_total
        FROM plantacion.v_quimicos_categorias
        ORDER BY activa DESC, categoria
    """)


def productos() -> list[dict]:
    return db.fetch_all("""
        SELECT producto_id, producto, activo, categoria_producto_id, categoria,
               categoria_activa, usos
        FROM plantacion.v_quimicos_productos
        ORDER BY activo DESC, categoria, producto
    """)


def _uno(sql: str, params: tuple) -> int:
    with db.get_cursor() as cur:
        cur.execute(sql, params)
        return (cur.fetchone() or {}).get("n", 0)


def categoria_crear(nombre: str, usuario: str) -> int:
    return _uno("SELECT plantacion.quimicos_categoria_crear(%s::text, %s::text) AS n", (nombre, usuario))

def categoria_desactivar(id_: int, usuario: str) -> int:
    return _uno("SELECT plantacion.quimicos_categoria_desactivar(%s, %s::text) AS n", (id_, usuario))

def categoria_reactivar(id_: int, usuario: str) -> int:
    return _uno("SELECT plantacion.quimicos_categoria_reactivar(%s, %s::text) AS n", (id_, usuario))

def producto_crear(nombre: str, categoria_id: int, usuario: str) -> int:
    return _uno("SELECT plantacion.quimicos_producto_crear(%s::text, %s::integer, %s::text) AS n",
                (nombre, categoria_id, usuario))

def producto_desactivar(id_: int, usuario: str) -> int:
    return _uno("SELECT plantacion.quimicos_producto_desactivar(%s, %s::text) AS n", (id_, usuario))

def producto_reactivar(id_: int, usuario: str) -> int:
    return _uno("SELECT plantacion.quimicos_producto_reactivar(%s, %s::text) AS n", (id_, usuario))
