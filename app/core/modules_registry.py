"""
PalmaData · Registro de módulos
================================
ESTE ES EL ÚNICO ARCHIVO QUE TOCAS PARA AÑADIR UN MÓDULO AL MENÚ.

Cada módulo:
  id         -> identificador único, se usa en la URL y para cargar su JS
  nombre     -> texto del menú lateral
  icono      -> nombre de icono (ver web/core/icons.js)
  activo     -> True para mostrarlo; False lo oculta sin borrarlo
  submodulos -> lista opcional [{id, nombre}]

El frontend lee /api/modulos y construye el menú solo.
Para que un módulo tenga pantalla propia, además de registrarlo aquí:
  1. crea  app/modules/<id>/router.py  y móntalo en app/main.py
  2. crea  web/modules/<id>/<id>.js  con una función montar(contenedor, sub)
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
        "id": "fertilizacion",
        "nombre": "Fertilización",
        "icono": "leaf",
        "activo": True,
        "submodulos": [
            {"id": "resumen",     "nombre": "Resumen"},
            {"id": "diagnostico", "nombre": "Diagnóstico"},
            {"id": "balance",     "nombre": "Índice de balance"},
            {"id": "aplicaciones","nombre": "Aplicaciones"},
            {"id": "oxido",       "nombre": "Requerimiento en óxido"},
            {"id": "rendimiento", "nombre": "Requerimiento para rendimiento"},
            {"id": "plan",        "nombre": "Plan y costos"},
            {"id": "parametros",  "nombre": "Parámetros"},
            {"id": "datos",       "nombre": "Cargar datos"},
        ],
    },
    {
        "id": "asistencia",
        "nombre": "Asistencia",
        "icono": "clock",
        "activo": True,
        "submodulos": [
            {"id": "analisis", "nombre": "Análisis"},
            {"id": "revisar",  "nombre": "A revisar"},
            {"id": "datos",    "nombre": "Cargar datos"},
            {"id": "personal", "nombre": "Trabajadores activos"},
        ],
    },
    # --- Futuros módulos (desactivados hasta que se construyan) ---
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
