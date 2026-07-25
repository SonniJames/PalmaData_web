"""
PalmaData · Registro de módulos
================================
ESTE ES EL ÚNICO ARCHIVO QUE TOCAS PARA AÑADIR UN MÓDULO NUEVO.

Cada módulo es un diccionario con:
  id        -> identificador único (sin espacios), usado en la URL
  nombre    -> texto que se ve en el menú lateral
  icono     -> nombre de icono (usamos SVG inline por nombre; ver web/core/icons.js)
  activo    -> True para mostrarlo, False para ocultarlo sin borrarlo
  submodulos-> lista opcional de sub-items [{id, nombre}]

El frontend consume esta lista desde /api/modulos y construye el menú solo.
Cuando montemos ANALFOLI, solo cambiaremos activo=True (o añadiremos su entrada).
"""

MODULOS = [
    {
        "id": "inicio",
        "nombre": "Inicio",
        "icono": "home",
        "activo": True,
        "submodulos": [],
    },
    {
        "id": "analfoli",
        "nombre": "Análisis Foliar",
        "icono": "leaf",
        "activo": False,   # se activará cuando montemos el módulo
        "submodulos": [
            {"id": "lotes", "nombre": "Lotes y resultados"},
            {"id": "parametros", "nombre": "Parámetros"},
            {"id": "plan", "nombre": "Plan de fertilización"},
            {"id": "avance", "nombre": "Avance de aplicación"},
        ],
    },
    # --- Ejemplos de futuros módulos (desactivados) ---
    {
        "id": "produccion",
        "nombre": "Producción",
        "icono": "chart",
        "activo": False,
        "submodulos": [],
    },
    {
        "id": "sanidad",
        "nombre": "Sanidad",
        "icono": "shield",
        "activo": False,
        "submodulos": [],
    },
]


def modulos_activos() -> list[dict]:
    """Solo los módulos visibles, para pintar el menú."""
    return [m for m in MODULOS if m.get("activo")]
