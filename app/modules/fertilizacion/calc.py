"""
PalmaData · Fertilización · Consolidación
=========================================
Lo único que calcula el backend. NO toca la agronomía:
los valores del Excel se usan tal como vienen.

Aquí solo hay aritmética de gestión:
  · totales de fertilizante por zona / edad / material
  · costos (toneladas × precio) e indirectos
  · nutriente por lote en toneladas (lo que el Excel tiene en Hoja1)
  · semáforo del índice de balance para colorear
  · indicadores para las gráficas
"""
from .columnas import ETIQUETA_NUTRIENTE, NUTRIENTES, PRODUCTOS


def num(v) -> float:
    try:
        f = float(v)
        return f if f == f else 0.0   # descarta NaN
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


def costo_lote(toneladas: dict, params: dict) -> dict:
    """Costo de un lote: cada producto por su precio + indirectos."""
    precios = params.get("precios", {})
    costos = params.get("costos", {})

    detalle, total_ton, total_cop = {}, 0.0, 0.0
    for campo, clave_precio, _ in PRODUCTOS:
        t = num(toneladas.get(campo))
        c = t * num(precios.get(clave_precio))
        detalle[clave_precio] = {"toneladas": t, "costo": c}
        total_ton += t
        total_cop += c

    flete = total_ton * num(costos.get("flete_por_ton"))
    aplicacion = total_ton * num(costos.get("aplicacion_por_ton"))

    return {
        "detalle": detalle,
        "toneladas": round(total_ton, 3),
        "costo_fertilizante": total_cop,
        "costo_flete": flete,
        "costo_aplicacion": aplicacion,
        "costo_total": total_cop + flete + aplicacion,
    }


def nutrientes_lote(oxido: dict, palmas) -> dict:
    """
    Equivalente a la Hoja1 del Excel: nutriente en toneladas por lote.
      toneladas = kg/palma × palmas ÷ 1000
    """
    H = num(palmas)
    return {campo.replace("ox_", "t_"): num(valor) * H / 1000
            for campo, valor in (oxido or {}).items()}


def preparar_lote(fila: dict, params: dict) -> dict:
    """
    Arma el lote que consume el frontend: los datos tal cual vienen
    del Excel, más el costo, el semáforo y el nutriente en toneladas.
    """
    lote = dict(fila)
    bands = params.get("bands", {})

    indice = lote.get("indice") or {}
    lote["semaforo"] = {n: semaforo(indice.get(n), bands) for n in NUTRIENTES}
    lote["costos"] = costo_lote(lote.get("toneladas") or {}, params)
    lote["nutrientes_ton"] = nutrientes_lote(lote.get("oxido") or {},
                                             lote.get("palmas"))
    return lote


def consolidar(lotes: list[dict], por: str, params: dict) -> dict:
    """
    Agrupa por zona, rango_edad o material.
    Devuelve los grupos y el total general.
    """
    grupos: dict[str, dict] = {}

    for l in lotes:
        clave = l.get(por) or "Sin dato"
        g = grupos.setdefault(clave, {
            "grupo": clave, "lotes": 0, "palmas": 0, "tons_fruto": 0.0,
            "toneladas": 0.0, "costo_total": 0.0,
            **{p[1]: 0.0 for p in PRODUCTOS},
        })
        g["lotes"] += 1
        g["palmas"] += int(num(l.get("palmas")))
        g["tons_fruto"] += num(l.get("tons"))
        g["toneladas"] += l["costos"]["toneladas"]
        g["costo_total"] += l["costos"]["costo_total"]
        for campo, clave_precio, _ in PRODUCTOS:
            g[clave_precio] += num((l.get("toneladas") or {}).get(campo))

    lista = sorted(grupos.values(), key=lambda x: str(x["grupo"]))
    for g in lista:
        for k in ("toneladas", "tons_fruto", *[p[1] for p in PRODUCTOS]):
            g[k] = round(g[k], 2)

    total = {
        "lotes": sum(g["lotes"] for g in lista),
        "palmas": sum(g["palmas"] for g in lista),
        "tons_fruto": round(sum(g["tons_fruto"] for g in lista), 2),
        "toneladas": round(sum(g["toneladas"] for g in lista), 2),
        "costo_total": sum(g["costo_total"] for g in lista),
    }
    for _, clave, _ in PRODUCTOS:
        total[clave] = round(sum(g[clave] for g in lista), 2)

    otros = num(params.get("costos", {}).get("otros"))
    total["otros_costos"] = otros
    total["costo_total"] += otros

    presupuesto = num(params.get("metas", {}).get("presupuesto"))
    if presupuesto:
        total["presupuesto"] = presupuesto
        total["ejecucion_pct"] = round(total["costo_total"] / presupuesto * 100, 1)

    if total["palmas"]:
        total["costo_por_palma"] = total["costo_total"] / total["palmas"]
    if total["tons_fruto"]:
        total["costo_por_ton_fruto"] = total["costo_total"] / total["tons_fruto"]

    return {"grupos": lista, "total": total}


def resumen_nutricional(lotes: list[dict], params: dict) -> dict:
    """
    Para las gráficas: cuántos lotes hay en cada estado nutricional,
    por nutriente. Alimenta el diagnóstico de la plantación.
    """
    estados = ["deficiente", "bajo", "optimo", "excesivo", "sin-dato"]
    salida = []

    for n in NUTRIENTES:
        conteo = {e: 0 for e in estados}
        suma = 0.0
        con_dato = 0
        for l in lotes:
            estado = l["semaforo"].get(n, "sin-dato")
            conteo[estado] += 1
            v = num((l.get("indice") or {}).get(n))
            if v > 0:
                suma += v
                con_dato += 1
        salida.append({
            "nutriente": ETIQUETA_NUTRIENTE[n],
            "clave": n,
            "promedio": round(suma / con_dato, 1) if con_dato else 0,
            **conteo,
        })

    return {"nutrientes": salida, "total_lotes": len(lotes)}


def comparar_campanas(datos_por_anio: dict[int, dict]) -> list[dict]:
    """Compara toneladas y costo entre campañas."""
    salida = []
    for anio in sorted(datos_por_anio):
        t = datos_por_anio[anio]["total"]
        fila = {"anio": anio, "lotes": t["lotes"], "palmas": t["palmas"],
                "toneladas": t["toneladas"], "costo_total": t["costo_total"]}
        for _, clave, _ in PRODUCTOS:
            fila[clave] = t.get(clave, 0)
        if t["palmas"]:
            fila["costo_por_palma"] = round(t["costo_total"] / t["palmas"], 2)
        salida.append(fila)
    return salida
