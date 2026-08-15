"""
PalmaData · Asistencia · Análisis
=================================
Todo se calcula sobre los días CON REGISTRO, nunca sobre los días
del calendario: domingos, festivos y ausencias no deben bajar los
promedios de nadie.

Los días con marcación incompleta (una sola marca, o entrada y
salida demasiado juntas) no entran en los promedios de jornada,
pero sí se reportan aparte para poder revisarlos.
"""
from datetime import time


def minutos_a_hora(minutos) -> str | None:
    """420 -> '07:00'. Sirve para mostrar un promedio de hora del día."""
    if minutos is None:
        return None
    m = int(round(float(minutos)))
    m = max(0, min(m, 24 * 60 - 1))
    return f"{m // 60:02d}:{m % 60:02d}"


def minutos_a_duracion(minutos) -> str | None:
    """455 -> '7h 35m'."""
    if minutos is None:
        return None
    m = int(round(float(minutos)))
    signo = "-" if m < 0 else ""
    m = abs(m)
    return f"{signo}{m // 60}h {m % 60:02d}m"


def hora_a_minutos(t) -> int | None:
    if t is None:
        return None
    if isinstance(t, time):
        return t.hour * 60 + t.minute
    texto = str(t)
    try:
        partes = texto.split(":")
        return int(partes[0]) * 60 + int(partes[1])
    except (ValueError, IndexError):
        return None


def _promedio(valores: list) -> float | None:
    limpio = [v for v in valores if v is not None]
    return sum(limpio) / len(limpio) if limpio else None


def resumen_trabajador(marcaciones: list[dict]) -> dict:
    """
    Resume los días de una persona.

    Si el filtro deja un solo día, los promedios coinciden con ese
    día, que es justo lo que se espera al seleccionar una fecha.
    """
    completos = [m for m in marcaciones if m.get("estado") == "completo"]
    incompletos = [m for m in marcaciones if m.get("estado") == "incompleta"]

    entradas = [hora_a_minutos(m.get("entrada")) for m in completos]
    salidas = [hora_a_minutos(m.get("salida")) for m in completos]
    duraciones = [m.get("minutos") for m in completos
                  if m.get("minutos") is not None]

    prom_entrada = _promedio(entradas)
    prom_salida = _promedio(salidas)
    prom_duracion = _promedio(duraciones)

    return {
        "dias_registrados": len(marcaciones),
        "dias_calculables": len(completos),
        "dias_incompletos": len(incompletos),
        "entrada_min": prom_entrada,
        "salida_min": prom_salida,
        "duracion_min": prom_duracion,
        "entrada": minutos_a_hora(prom_entrada),
        "salida": minutos_a_hora(prom_salida),
        "duracion": minutos_a_duracion(prom_duracion),
        "horas_total": round(sum(duraciones) / 60, 2) if duraciones else 0,
        "horas_promedio": round(prom_duracion / 60, 2) if prom_duracion else 0,
        "entrada_temprana": minutos_a_hora(min(entradas)) if entradas else None,
        "entrada_tardia": minutos_a_hora(max(entradas)) if entradas else None,
        "jornada_min": minutos_a_duracion(min(duraciones)) if duraciones else None,
        "jornada_max": minutos_a_duracion(max(duraciones)) if duraciones else None,
    }


def motivo_revisar(f: dict) -> str:
    """
    Por qué un día no tiene jornada calculable.

    Se decide por lo que FALTA, no por lo que hay. En el formato 2 el
    huellero distingue entrada de salida, así que alguien puede tener
    solo salida; decirle "marcas muy juntas" sería falso.
    """
    entrada, salida = f.get("entrada"), f.get("salida")

    if entrada and salida:
        minutos = f.get("minutos")
        if minutos is not None and minutos < 0:
            return "Salida antes de la entrada"
        return "Marcas muy juntas"

    # Una sola marca. El formato 1 no distingue entrada de salida: la
    # posición se estimó por la hora del día, así que se advierte.
    # El formato 2 sí la trae explícita del huellero.
    if f.get("estimado") or f.get("formato") == 1:
        return ("Solo una marca (se estimó salida)" if salida
                else "Solo una marca (se estimó entrada)")
    if salida:
        return "Solo marcó la salida"
    if entrada:
        return "Solo marcó la entrada"
    return "Sin marcación"


def analizar(filas: list[dict], top: int = 10) -> dict:
    """
    Análisis completo del período filtrado.

    `filas` son marcaciones ya filtradas por empresa, año, mes y día.
    """
    if not filas:
        return {"vacio": True}

    # --- Agrupar por trabajador ---
    por_persona: dict = {}
    for f in filas:
        clave = f.get("trabajador_id")
        p = por_persona.setdefault(clave, {
            "trabajador_id": clave,
            "codigo": f.get("codigo"),
            "nombre": f.get("nombre"),
            "empresa": f.get("empresa"),
            "zona": f.get("zona"),
            "departamento": None,
            "marcaciones": [],
        })
        if f.get("departamento"):
            p["departamento"] = f["departamento"]   # el último visto manda
        p["marcaciones"].append(f)

    trabajadores = []
    for p in por_persona.values():
        r = resumen_trabajador(p["marcaciones"])
        trabajadores.append({
            "trabajador_id": p["trabajador_id"],
            "codigo": p["codigo"], "nombre": p["nombre"],
            "empresa": p["empresa"], "zona": p["zona"],
            "departamento": p["departamento"], **r,
        })
    trabajadores.sort(key=lambda x: (x["nombre"] or "").lower())

    # --- Totales del período ---
    completos = [f for f in filas if f.get("estado") == "completo"]
    incompletos = [f for f in filas if f.get("estado") == "incompleta"]
    duraciones = [f["minutos"] for f in completos if f.get("minutos") is not None]
    entradas = [hora_a_minutos(f.get("entrada")) for f in completos]
    salidas = [hora_a_minutos(f.get("salida")) for f in completos]

    prom_ent = _promedio(entradas)
    prom_sal = _promedio(salidas)
    prom_dur = _promedio(duraciones)

    total = {
        "trabajadores": len(trabajadores),
        "dias_registrados": len(filas),
        "dias_calculables": len(completos),
        "dias_incompletos": len(incompletos),
        "entrada": minutos_a_hora(prom_ent),
        "salida": minutos_a_hora(prom_sal),
        "duracion": minutos_a_duracion(prom_dur),
        "horas_promedio": round(prom_dur / 60, 2) if prom_dur else 0,
        "horas_total": round(sum(duraciones) / 60, 2) if duraciones else 0,
    }

    # --- Rankings, solo con quienes tienen días calculables ---
    con_datos = [t for t in trabajadores if t["dias_calculables"] > 0]
    mayor = sorted(con_datos, key=lambda x: -(x["duracion_min"] or 0))[:top]
    menor = sorted(con_datos, key=lambda x: (x["duracion_min"] or 0))[:top]
    madrugadores = sorted(con_datos, key=lambda x: (x["entrada_min"] or 9999))[:top]

    # --- Por día del período ---
    por_dia: dict = {}
    for f in completos:
        clave = str(f.get("fecha"))
        d = por_dia.setdefault(clave, {"fecha": clave, "dia": f.get("dia"),
                                       "duraciones": [], "entradas": []})
        if f.get("minutos") is not None:
            d["duraciones"].append(f["minutos"])
        e = hora_a_minutos(f.get("entrada"))
        if e is not None:
            d["entradas"].append(e)

    dias = []
    for d in por_dia.values():
        pd = _promedio(d["duraciones"])
        dias.append({
            "fecha": d["fecha"], "dia": d["dia"],
            "trabajadores": len(d["duraciones"]),
            "duracion": minutos_a_duracion(pd),
            "duracion_min": pd,
            "horas_promedio": round(pd / 60, 2) if pd else 0,
            "entrada": minutos_a_hora(_promedio(d["entradas"])),
        })
    dias.sort(key=lambda x: x["fecha"])

    dias_ordenados = sorted([d for d in dias if d["duracion_min"] is not None],
                            key=lambda x: x["duracion_min"])

    # --- Días a revisar ---
    revisar = [{
        "trabajador_id": f.get("trabajador_id"),
        "codigo": f.get("codigo"), "nombre": f.get("nombre"),
        "departamento": f.get("departamento"), "zona": f.get("zona"),
        "fecha": str(f.get("fecha")), "dia": f.get("dia"),
        "entrada": f["entrada"].strftime("%H:%M") if f.get("entrada") else None,
        "salida": f["salida"].strftime("%H:%M") if f.get("salida") else None,
        "n_marcas": f.get("n_marcas"),
        "estimado": bool(f.get("estimado")) or f.get("formato") == 1,
        "motivo": motivo_revisar(f),
    } for f in incompletos]
    revisar.sort(key=lambda x: (x["fecha"], x["nombre"] or ""))

    # --- Por supervisor (columna Department del huellero) ---
    # Se agrupan las marcaciones, no los trabajadores, porque alguien
    # puede cambiar de supervisor dentro del período.
    equipos: dict = {}
    for f in filas:
        clave = f.get("departamento") or "Sin asignar"
        g = equipos.setdefault(clave, {
            "departamento": clave, "marcaciones": [], "personas": set()})
        g["marcaciones"].append(f)
        g["personas"].add(f.get("trabajador_id"))

    supervisores = []
    for g in equipos.values():
        r = resumen_trabajador(g["marcaciones"])
        supervisores.append({
            "departamento": g["departamento"],
            "trabajadores": len(g["personas"]),
            "dias_registrados": r["dias_registrados"],
            "dias_calculables": r["dias_calculables"],
            "dias_incompletos": r["dias_incompletos"],
            "entrada": r["entrada"], "salida": r["salida"],
            "duracion": r["duracion"], "duracion_min": r["duracion_min"],
            "entrada_min": r["entrada_min"],
            "horas_promedio": r["horas_promedio"],
            "horas_total": r["horas_total"],
        })

    con_jornada = [s for s in supervisores if s["dias_calculables"] > 0]
    supervisores.sort(key=lambda x: -(x["duracion_min"] or 0))

    return {
        "vacio": False,
        "total": total,
        "trabajadores": trabajadores,
        "supervisores": supervisores,
        "supervisores_mayor": sorted(con_jornada,
            key=lambda x: -(x["duracion_min"] or 0))[:top],
        "supervisores_menor": sorted(con_jornada,
            key=lambda x: (x["duracion_min"] or 0))[:top],
        "mayor_duracion": mayor,
        "menor_duracion": menor,
        "madrugadores": madrugadores,
        "por_dia": dias,
        "dias_menos_horas": dias_ordenados[:top],
        "dias_mas_horas": list(reversed(dias_ordenados[-top:])),
        "revisar": revisar[:200],
        "total_revisar": len(revisar),
    }
