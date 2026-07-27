"""
PalmaData · Fertilización · Parámetros ingresables
==================================================
En este enfoque el sistema NO recalcula la agronomía: eso viene resuelto
en el Excel del ingeniero. Lo único que se ingresa desde la web es lo
que el Excel no trae y sí depende de la gestión: precios, umbrales de
semáforo para las gráficas, y metas.

Se guardan por campaña en plantacion.fert_parametros.
"""
import copy

DEF_PARAMS: dict = {

    # Precios de fertilizantes · COP por TONELADA
    # Multiplican las toneladas del bloque final del Excel (DX-ED).
    "precios": {
        "grado":     3500000,   # Grado 13-5-27-5(Mg)
        "nca":       2900000,   # Nitrato de calcio
        "rafos":     1700000,   # Rafos 12-24-12
        "ksomgo":    3100000,   # PatentKali / Sulfato doble K-Mg
        "kieserita": 2300000,
        "borax":     8500000,   # Bórax 48%
        "znso4":     4200000,   # Sulfato de zinc
    },

    # Umbrales del semáforo del índice de balance (% sobre el óptimo).
    # Solo afectan los COLORES de las tablas y gráficas, no los números.
    "bands": {
        "deficiente": 70,
        "bajo":       90,
        "optimo":     120,
    },

    # Costos indirectos de la campaña, para el costo total real
    "costos": {
        "flete_por_ton":       0,    # COP por tonelada transportada
        "aplicacion_por_ton":  0,    # COP por tonelada aplicada (mano de obra)
        "otros":               0,    # COP fijos de la campaña
    },

    # Metas de la campaña, para comparar contra lo planeado
    "metas": {
        "presupuesto":    0,    # COP disponibles
        "tons_fruto":     0,    # producción esperada de la plantación
    },
}

ETIQUETAS = {
    "precios": "Precios de fertilizantes (COP por tonelada)",
    "bands":   "Umbrales del semáforo (% sobre el óptimo)",
    "costos":  "Costos indirectos",
    "metas":   "Metas de la campaña",
}

CAMPOS = {
    "grado": "Grado 13-5-27-5(Mg)",
    "nca": "Nitrato de calcio",
    "rafos": "Rafos 12-24-12",
    "ksomgo": "PatentKali (K-Mg)",
    "kieserita": "Kieserita",
    "borax": "Bórax 48%",
    "znso4": "Sulfato de zinc",
    "deficiente": "Deficiente por debajo de",
    "bajo": "Bajo por debajo de",
    "optimo": "Óptimo hasta",
    "flete_por_ton": "Flete por tonelada",
    "aplicacion_por_ton": "Aplicación por tonelada",
    "otros": "Otros costos fijos",
    "presupuesto": "Presupuesto de la campaña",
    "tons_fruto": "Producción esperada (ton fruto)",
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
