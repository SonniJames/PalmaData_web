"""
PalmaData · Fertilización · Parámetros
======================================
El sistema no recalcula la agronomía: eso viene resuelto del Excel.
Aquí solo vive lo que el archivo no trae y sí depende de la gestión.

Se guardan por campaña en plantacion.fert_parametros (JSONB).

Los PRECIOS son dinámicos: sus claves son los nombres de los
fertilizantes que trajo el Excel de esa campaña. Si el año que viene
se usan otros, aparecen solos en el formulario.
"""
import copy

DEF_PARAMS: dict = {

    # Precios por fertilizante · COP por unidad del Excel (normalmente tonelada).
    # Las claves se crean solas al cargar el archivo.
    #   {"Grado 13-5-27-5(Mg)": 3500000, "NCa": 2900000, ...}
    "precios": {},

    # Umbrales del semáforo del índice de balance (% sobre el óptimo).
    # Solo afectan los COLORES; los números no cambian.
    "bands": {
        "deficiente": 70,
        "bajo": 90,
        "optimo": 120,
    },

    # Hectáreas de la plantación, para el costo por hectárea.
    # Si la hoja identificacion trae la columna `hectareas`, se usa esa
    # (permite costo por hectárea por zona y por sector). Este valor
    # global es el respaldo cuando la columna no viene.
    "hectareas": 0,

    # Flete POR FERTILIZANTE · COP por tonelada transportada.
    # Mismas claves que `precios`: un valor por producto. Si el flete es
    # igual para todos, se pone el mismo número en cada uno (el formulario
    # tiene un botón para copiarlo). Si mañana un producto viene de otro
    # proveedor, se le pone su propia tarifa sin tocar los demás.
    #   {"Grado 13-5-27-5(Mg)": 180000, "Borax 48%": 240000, ...}
    "fletes": {},

    # Respaldo: se usa para los productos que no tengan flete propio.
    "flete_por_ton": 0,
}

ETIQUETAS = {
    "precios":   "Precios de fertilizantes (COP)",
    "fletes":    "Flete por fertilizante (COP por tonelada)",
    "bands":     "Umbrales del semáforo (% sobre el óptimo)",
    "generales": "Datos de la plantación",
}

CAMPOS = {
    "deficiente":    "Deficiente por debajo de",
    "bajo":          "Bajo por debajo de",
    "optimo":        "Óptimo hasta",
    "hectareas":     "Hectáreas totales",
    "flete_por_ton": "Flete (COP por tonelada)",
}


def get_default_params() -> dict:
    return copy.deepcopy(DEF_PARAMS)


def merge_params(base: dict, override: dict) -> dict:
    """Mezcla recursiva: `override` pisa a `base`, conservando claves nuevas."""
    out = copy.deepcopy(base)
    for clave, valor in (override or {}).items():
        if isinstance(valor, dict) and isinstance(out.get(clave), dict):
            out[clave] = merge_params(out[clave], valor)
        else:
            out[clave] = valor
    return out


def asegurar_precios(params: dict, fertilizantes: list[str]) -> dict:
    """
    Garantiza que todos los fertilizantes de la campaña tengan entrada
    de precio y de flete (en 0 si son nuevas), para que aparezcan en la web.
    """
    p = copy.deepcopy(params)
    p.setdefault("precios", {})
    p.setdefault("fletes", {})
    respaldo = p.get("flete_por_ton") or 0
    for f in fertilizantes:
        p["precios"].setdefault(f, 0)
        p["fletes"].setdefault(f, respaldo)
    return p


def flete_de(params: dict, producto: str) -> float:
    """Flete del producto; si no tiene propio, el respaldo general."""
    fletes = params.get("fletes") or {}
    valor = fletes.get(producto)
    if valor in (None, ""):
        valor = params.get("flete_por_ton") or 0
    try:
        return float(valor)
    except (TypeError, ValueError):
        return 0.0
