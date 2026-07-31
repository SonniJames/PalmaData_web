"""
PalmaData · Fertilización · Consolidación
=========================================
Lo único que calcula el backend. NO toca la agronomía:
los valores del Excel se usan tal como vienen.

Aquí solo hay aritmética de gestión:
  · costos = cantidad × precio
  · costo por palma y por hectárea
  · totales por zona, sector y rango de edad
  · semáforo del índice de balance (solo el color)
  · indicadores para las gráficas
"""
from .formato import ordenar_nutrientes
from .params import flete_de


def num(v) -> float:
    try:
        f = float(v)
        return f if f == f else 0.0
    except (TypeError, ValueError):
        return 0.0


def semaforo(indice, bands: dict) -> str:
    """Clasifica un índice de balance. Solo define el color."""
    if indice is None:
        return "sin-dato"
    v = num(indice)
    if v <= 0:
        return "sin-dato"
    if v < num(bands.get("deficiente", 70)):
        return "deficiente"
    if v < num(bands.get("bajo", 90)):
        return "bajo"
    if v <= num(bands.get("optimo", 120)):
        return "optimo"
    return "excesivo"


def costo_lote(requerimiento: dict, params: dict) -> dict:
    """
    Costo de un lote, flete incluido.

    Para cada fertilizante:
        costo = cantidad × (precio + flete de ESE fertilizante)

    Cada producto puede tener su propia tarifa de flete. El flete queda
    dentro del costo del producto, así se arrastra a todos los totales:
    por lote, por zona, por sector y general.
    """
    precios = params.get("precios") or {}

    detalle = {}
    total_cant = total_fert = total_flete = 0.0

    for producto, cantidad in (requerimiento or {}).items():
        c = num(cantidad)
        precio = num(precios.get(producto))
        flete_u = flete_de(params, producto)
        costo_fert = c * precio
        costo_flete = c * flete_u
        detalle[producto] = {
            "cantidad": c,
            "precio": precio,
            "flete": flete_u,
            "costo_fertilizante": costo_fert,
            "costo_flete": costo_flete,
            "costo": costo_fert + costo_flete,   # valor del producto puesto en finca
        }
        total_cant += c
        total_fert += costo_fert
        total_flete += costo_flete

    return {"detalle": detalle,
            "cantidad": round(total_cant, 3),
            "costo_fertilizante": total_fert,
            "costo_flete": total_flete,
            "costo_total": total_fert + total_flete}


def preparar_lote(fila: dict, params: dict) -> dict:
    """Añade al lote su semáforo y su costo."""
    lote = dict(fila)
    bands = params.get("bands", {})

    balance = lote.get("balance") or {}
    lote["semaforo"] = {k: semaforo(v, bands) for k, v in balance.items()}
    lote["costos"] = costo_lote(lote.get("requerimiento") or {}, params)

    ha = num(lote.get("hectareas"))
    palmas = num(lote.get("palmas"))
    if ha:
        lote["costos"]["costo_por_hectarea"] = lote["costos"]["costo_total"] / ha
    if palmas:
        lote["costos"]["costo_por_palma"] = lote["costos"]["costo_total"] / palmas

    return lote


def consolidar(lotes: list[dict], por: str, params: dict,
               fertilizantes: list[str] | None = None) -> dict:
    """Agrupa por zona, sector, rango_edad o material."""
    if fertilizantes is None:
        fertilizantes = sorted({f for l in lotes
                                for f in (l.get("requerimiento") or {})})

    grupos: dict[str, dict] = {}

    for l in lotes:
        clave = l.get(por) or "Sin dato"
        g = grupos.setdefault(clave, {
            "grupo": clave, "lotes": 0, "palmas": 0, "hectareas": 0.0,
            "tons_fruto": 0.0, "cantidad": 0.0,
            "costo_fertilizante": 0.0, "costo_flete": 0.0, "costo_total": 0.0,
            **{f: 0.0 for f in fertilizantes},
        })
        g["lotes"] += 1
        g["palmas"] += int(num(l.get("palmas")))
        g["hectareas"] += num(l.get("hectareas"))
        g["tons_fruto"] += num(l.get("tons"))
        g["cantidad"] += l["costos"]["cantidad"]
        g["costo_fertilizante"] += l["costos"]["costo_fertilizante"]
        g["costo_flete"] += l["costos"]["costo_flete"]
        g["costo_total"] += l["costos"]["costo_total"]
        for f in fertilizantes:
            g[f] += num((l.get("requerimiento") or {}).get(f))

    lista = sorted(grupos.values(), key=lambda x: str(x["grupo"]))
    for g in lista:
        for k in ("cantidad", "tons_fruto", "hectareas", *fertilizantes):
            g[k] = round(g[k], 2)
        if g["palmas"]:
            g["costo_por_palma"] = g["costo_total"] / g["palmas"]
        if g["hectareas"]:
            g["costo_por_hectarea"] = g["costo_total"] / g["hectareas"]

    total = {
        "lotes": sum(g["lotes"] for g in lista),
        "palmas": sum(g["palmas"] for g in lista),
        "hectareas": round(sum(g["hectareas"] for g in lista), 2),
        "tons_fruto": round(sum(g["tons_fruto"] for g in lista), 2),
        "cantidad": round(sum(g["cantidad"] for g in lista), 2),
        "costo_fertilizante": sum(g["costo_fertilizante"] for g in lista),
        "costo_flete": sum(g["costo_flete"] for g in lista),
        "costo_total": sum(g["costo_total"] for g in lista),
    }
    if total["cantidad"]:
        total["flete_promedio"] = total["costo_flete"] / total["cantidad"]
    for f in fertilizantes:
        total[f] = round(sum(g[f] for g in lista), 2)

    if total["palmas"]:
        total["costo_por_palma"] = total["costo_total"] / total["palmas"]

    # Hectáreas: las de los lotes; si no vienen, el valor global de parámetros
    ha = total["hectareas"] or num(params.get("hectareas"))
    if ha:
        total["hectareas_usadas"] = ha
        total["costo_por_hectarea"] = total["costo_total"] / ha
    if total["tons_fruto"]:
        total["costo_por_ton_fruto"] = total["costo_total"] / total["tons_fruto"]

    return {"grupos": lista, "total": total}


def resumen_nutricional(lotes: list[dict], params: dict) -> dict:
    """
    Para las gráficas: cuántos lotes hay en cada estado nutricional,
    por nutriente. Los nutrientes salen de los datos, no de una lista fija.
    """
    estados = ["deficiente", "bajo", "optimo", "excesivo", "sin-dato"]
    claves = {k for l in lotes for k in (l.get("balance") or {})}
    salida = []

    for n in ordenar_nutrientes(claves):
        conteo = {e: 0 for e in estados}
        suma, con_dato = 0.0, 0
        for l in lotes:
            estado = (l.get("semaforo") or {}).get(n, "sin-dato")
            conteo[estado] += 1
            v = num((l.get("balance") or {}).get(n))
            if v > 0:
                suma += v
                con_dato += 1
        salida.append({"nutriente": n,
                       "promedio": round(suma / con_dato, 1) if con_dato else 0,
                       **conteo})

    return {"nutrientes": salida, "total_lotes": len(lotes)}


def comparar_campanas(datos_por_anio: dict[int, dict]) -> list[dict]:
    """
    Compara campañas. Soporta que cada año use fertilizantes distintos:
    los que no existan en un año quedan en 0.
    """
    fijos = {"lotes", "palmas", "hectareas", "hectareas_usadas", "tons_fruto",
             "cantidad", "costo_total", "costo_fertilizante", "costo_flete",
             "flete_por_ton", "flete_promedio", "costo_por_palma",
             "costo_por_hectarea", "costo_por_ton_fruto"}
    productos = sorted({k for d in datos_por_anio.values()
                        for k in d["total"] if k not in fijos})

    salida = []
    for anio in sorted(datos_por_anio):
        t = datos_por_anio[anio]["total"]
        fila = {"anio": anio, "lotes": t["lotes"], "palmas": t["palmas"],
                "hectareas": t.get("hectareas", 0),
                "cantidad": t["cantidad"],
                "costo_fertilizante": t.get("costo_fertilizante", 0),
                "costo_flete": t.get("costo_flete", 0),
                "costo_total": t["costo_total"],
                "costo_por_palma": t.get("costo_por_palma", 0),
                "costo_por_hectarea": t.get("costo_por_hectarea", 0)}
        for p in productos:
            fila[p] = t.get(p, 0)
        salida.append(fila)

    return salida


# ============================================================
#  APLICACIONES · análisis enfocado en toneladas, no en costos
# ============================================================

def _promedio_esperada(lotes: list[dict]) -> float:
    """
    Promedio de cosecha esperada. Solo cuenta los lotes que tienen valor:
    los de levante (sin cosecha aún) bajarían el promedio artificialmente.
    """
    vals = [num(l.get("tons")) for l in lotes if num(l.get("tons")) > 0]
    return round(sum(vals) / len(vals), 2) if vals else 0.0


def _totales_grupo(lotes: list[dict], fertilizantes: list[str]) -> dict:
    """Suma de aplicaciones y dimensiones de un conjunto de lotes."""
    palmas = sum(int(num(l.get("palmas"))) for l in lotes)
    hectareas = sum(num(l.get("hectareas")) for l in lotes)
    por_prod = {f: 0.0 for f in fertilizantes}
    for l in lotes:
        req = l.get("requerimiento") or {}
        for f in fertilizantes:
            por_prod[f] += num(req.get(f))
    toneladas = sum(por_prod.values())

    return {
        "lotes": len(lotes),
        "palmas": palmas,
        "hectareas": round(hectareas, 2),
        "toneladas": round(toneladas, 3),
        "tons_esperada_prom": _promedio_esperada(lotes),
        "tons_esperada_total": round(sum(num(l.get("tons")) for l in lotes), 2),
        "kg_por_palma": round(toneladas * 1000 / palmas, 3) if palmas else 0,
        "kg_por_hectarea": round(toneladas * 1000 / hectareas, 2) if hectareas else 0,
        "productos": {f: round(v, 3) for f, v in por_prod.items()},
    }


def _agrupar(lotes: list[dict], por: str, fertilizantes: list[str]) -> list[dict]:
    grupos: dict[str, list] = {}
    for l in lotes:
        grupos.setdefault(l.get(por) or "Sin dato", []).append(l)
    salida = [{"grupo": clave, **_totales_grupo(items, fertilizantes)}
              for clave, items in grupos.items()]
    return sorted(salida, key=lambda x: -x["toneladas"])


def aplicaciones(lotes: list[dict], fertilizantes: list[str],
                 top: int = 15) -> dict:
    """
    Análisis del plan en toneladas.

    Devuelve todo lo que necesita la pantalla de Aplicaciones:
    por fertilizante, por zona, por sector, los lotes que más reciben,
    y las matrices fertilizante × zona y fertilizante × sector.
    """
    total = _totales_grupo(lotes, fertilizantes)
    tt = total["toneladas"] or 1
    palmas = total["palmas"] or 1
    ha = total["hectareas"]

    # --- Por fertilizante ---
    por_fertilizante = []
    for f in fertilizantes:
        t = total["productos"].get(f, 0)
        por_fertilizante.append({
            "nombre": f,
            "toneladas": t,
            "porcentaje": round(t / tt * 100, 1),
            "kg_por_palma": round(t * 1000 / palmas, 3),
            "kg_por_hectarea": round(t * 1000 / ha, 2) if ha else 0,
            "gramos_por_palma": round(t * 1_000_000 / palmas, 1),
        })
    por_fertilizante.sort(key=lambda x: -x["toneladas"])

    # --- Por zona y por sector ---
    por_zona = _agrupar(lotes, "zona", fertilizantes)
    por_sector = _agrupar(lotes, "sector", fertilizantes)

    # --- Lotes que más reciben ---
    ranking = []
    for l in lotes:
        req = l.get("requerimiento") or {}
        t = sum(num(v) for v in req.values())
        p = int(num(l.get("palmas")))
        ranking.append({
            "identificacion": l.get("identificacion"),
            "uma": l.get("uma"),
            "zona": l.get("zona"),
            "sector": l.get("sector"),
            "palmas": p,
            "hectareas": num(l.get("hectareas")),
            "toneladas": round(t, 3),
            "tons_esperada": num(l.get("tons")),
            "kg_por_palma": round(t * 1000 / p, 3) if p else 0,
        })
    ranking.sort(key=lambda x: -x["toneladas"])

    # --- Matrices fertilizante × grupo ---
    def matriz(grupos: list[dict]) -> dict:
        claves = [g["grupo"] for g in grupos]
        filas = []
        for f in fertilizantes:
            valores = {g["grupo"]: g["productos"].get(f, 0) for g in grupos}
            filas.append({"fertilizante": f, "valores": valores,
                          "total": round(sum(valores.values()), 3)})
        filas.sort(key=lambda x: -x["total"])
        return {"grupos": claves, "filas": filas,
                "totales": {g["grupo"]: g["toneladas"] for g in grupos}}

    return {
        "total": total,
        "por_fertilizante": por_fertilizante,
        "por_zona": por_zona,
        "por_sector": por_sector,
        "top_lotes": ranking[:top],
        "matriz_zona": matriz(por_zona),
        "matriz_sector": matriz(por_sector),
        "fertilizantes": fertilizantes,
    }
