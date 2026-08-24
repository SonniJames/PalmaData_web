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


# ============================================================
#  ANÁLISIS SOBRE TRABAJADORES ACTIVOS
#
#  Dos pantallas con propósitos distintos:
#
#    analizar_completos  -> solo quienes marcaron entrada Y salida.
#                           Es donde se miden jornadas y horarios.
#
#    analizar_revisar    -> todo lo demás: solo entrada, solo salida
#                           o ninguna marca. Es la lista de trabajo.
#
#  El porcentaje de marcación cruza las dos: cuántos de los que
#  debían marcar lo hicieron bien.
# ============================================================

def _pct(parte, total) -> float:
    return round(parte / total * 100, 1) if total else 0.0


def analizar_completos(filas: list[dict], padron: list[dict],
                       top: int = 10) -> dict:
    """
    Análisis de jornadas. Solo entran los días con entrada y salida.

    `padron` son los trabajadores activos que debían marcar; sirve de
    denominador del porcentaje. Sin él, un 100% no significaría nada.
    """
    completos = [f for f in filas if f.get("estado") == "completo"]

    por_persona: dict = {}
    for f in completos:
        p = por_persona.setdefault(f["trabajador_id"], {
            "trabajador_id": f["trabajador_id"],
            "codigo": f.get("codigo"), "nombre": f.get("nombre"),
            "supervisor": f.get("supervisor"), "marcaciones": [],
        })
        p["marcaciones"].append(f)

    trabajadores = []
    for p in por_persona.values():
        r = resumen_trabajador(p["marcaciones"])
        trabajadores.append({
            "trabajador_id": p["trabajador_id"], "codigo": p["codigo"],
            "nombre": p["nombre"], "supervisor": p["supervisor"], **r,
        })
    trabajadores.sort(key=lambda x: (x["nombre"] or "").lower())

    duraciones = [f["minutos"] for f in completos if f.get("minutos") is not None]
    entradas = [hora_a_minutos(f.get("entrada")) for f in completos]
    salidas = [hora_a_minutos(f.get("salida")) for f in completos]

    prom_dur = _promedio(duraciones)
    dias = sorted({str(f["fecha"]) for f in filas})
    n_padron = len(padron)
    esperados = n_padron * len(dias)

    total = {
        "trabajadores_activos": n_padron,
        "trabajadores_con_jornada": len(trabajadores),
        "dias": len(dias),
        "registros_completos": len(completos),
        "esperados": esperados,
        "pct_marcacion": _pct(len(completos), esperados),
        "entrada": minutos_a_hora(_promedio(entradas)),
        "salida": minutos_a_hora(_promedio(salidas)),
        "duracion": minutos_a_duracion(prom_dur),
        "horas_promedio": round(prom_dur / 60, 2) if prom_dur else 0,
        "horas_total": round(sum(duraciones) / 60, 2) if duraciones else 0,
    }

    # --- Marcación día a día ---
    por_dia: dict = {}
    for f in completos:
        clave = str(f["fecha"])
        d = por_dia.setdefault(clave, {"fecha": clave, "dia": f.get("dia"),
                                       "duraciones": [], "entradas": []})
        if f.get("minutos") is not None:
            d["duraciones"].append(f["minutos"])
        e = hora_a_minutos(f.get("entrada"))
        if e is not None:
            d["entradas"].append(e)

    serie = []
    for fecha in dias:
        d = por_dia.get(fecha)
        marcaron = len(d["duraciones"]) if d else 0
        pd = _promedio(d["duraciones"]) if d else None
        serie.append({
            "fecha": fecha,
            "marcaron": marcaron,
            "esperados": n_padron,
            "pct": _pct(marcaron, n_padron),
            "duracion": minutos_a_duracion(pd),
            "horas_promedio": round(pd / 60, 2) if pd else 0,
            "entrada": minutos_a_hora(_promedio(d["entradas"])) if d else None,
        })

    # --- Por supervisor ---
    equipos: dict = {}
    for t in padron:
        clave = t.get("supervisor") or "Sin asignar"
        g = equipos.setdefault(clave, {"supervisor": clave, "personas": set(),
                                       "marcaciones": []})
        g["personas"].add(t["trabajador_id"])
    for f in completos:
        clave = f.get("supervisor") or "Sin asignar"
        g = equipos.setdefault(clave, {"supervisor": clave, "personas": set(),
                                       "marcaciones": []})
        g["marcaciones"].append(f)

    supervisores = []
    for g in equipos.values():
        r = resumen_trabajador(g["marcaciones"])
        esperados_g = len(g["personas"]) * len(dias)
        supervisores.append({
            "supervisor": g["supervisor"],
            "trabajadores": len(g["personas"]),
            "registros_completos": len(g["marcaciones"]),
            "esperados": esperados_g,
            "pct_marcacion": _pct(len(g["marcaciones"]), esperados_g),
            "entrada": r["entrada"], "salida": r["salida"],
            "duracion": r["duracion"], "duracion_min": r["duracion_min"],
            "horas_promedio": r["horas_promedio"],
            "horas_total": r["horas_total"],
        })

    con_datos = [s for s in supervisores if s["registros_completos"] > 0]
    supervisores.sort(key=lambda x: -x["pct_marcacion"])

    con_jornada = [t for t in trabajadores if t["dias_calculables"] > 0]

    return {
        "vacio": not completos and not padron,
        "total": total,
        "trabajadores": trabajadores,
        "serie": serie,
        "supervisores": supervisores,
        "sup_mejor_marcacion": sorted(con_datos,
            key=lambda x: -x["pct_marcacion"])[:top],
        "sup_mayor_jornada": sorted(con_datos,
            key=lambda x: -(x["duracion_min"] or 0))[:top],
        "mayor_duracion": sorted(con_jornada,
            key=lambda x: -(x["duracion_min"] or 0))[:top],
        "menor_duracion": sorted(con_jornada,
            key=lambda x: (x["duracion_min"] or 0))[:top],
        "madrugadores": sorted(con_jornada,
            key=lambda x: (x["entrada_min"] or 9999))[:top],
    }


def analizar_revisar(filas: list[dict], padron: list[dict],
                     un_dia: bool = False, top: int = 10) -> dict:
    """
    Casos a revisar: marcaciones incompletas y ausencias.

    Los días sin ninguna marca no existen en la base (las celdas vacías
    no se guardan), así que las ausencias se deducen comparando el
    padrón con quienes sí tienen registro.
    """
    incompletos = [f for f in filas if f.get("estado") == "incompleta"]
    con_registro = {f["trabajador_id"] for f in filas}

    revisar = []
    for f in incompletos:
        revisar.append({
            "trabajador_id": f.get("trabajador_id"),
            "codigo": f.get("codigo"), "nombre": f.get("nombre"),
            "supervisor": f.get("supervisor"),
            "fecha": str(f.get("fecha")), "dia": f.get("dia"),
            "entrada": f["entrada"].strftime("%H:%M") if f.get("entrada") else None,
            "salida": f["salida"].strftime("%H:%M") if f.get("salida") else None,
            "n_marcas": f.get("n_marcas"),
            "sin_registro": False,
            "motivo": motivo_revisar(f),
        })

    fecha_dia = str(filas[0].get("fecha")) if (un_dia and filas) else None
    ausentes = [t for t in padron if t["trabajador_id"] not in con_registro]
    for t in ausentes:
        revisar.append({
            "trabajador_id": t["trabajador_id"],
            "codigo": t.get("codigo"), "nombre": t.get("nombre"),
            "supervisor": t.get("supervisor"),
            "fecha": fecha_dia, "dia": None,
            "entrada": None, "salida": None, "n_marcas": 0,
            "sin_registro": True,
            "motivo": "No marcó" if un_dia else "Sin registros en el período",
        })

    revisar.sort(key=lambda x: (x["fecha"] or "", x["nombre"] or ""))

    # --- Por supervisor ---
    equipos: dict = {}
    for t in padron:
        clave = t.get("supervisor") or "Sin asignar"
        g = equipos.setdefault(clave, {"supervisor": clave, "personas": set(),
                                       "casos": 0, "sin_marcar": 0})
        g["personas"].add(t["trabajador_id"])
    for x in revisar:
        clave = x.get("supervisor") or "Sin asignar"
        g = equipos.setdefault(clave, {"supervisor": clave, "personas": set(),
                                       "casos": 0, "sin_marcar": 0})
        g["casos"] += 1
        if x["sin_registro"]:
            g["sin_marcar"] += 1

    supervisores = [{
        "supervisor": g["supervisor"],
        "trabajadores": len(g["personas"]),
        "casos": g["casos"],
        "sin_marcar": g["sin_marcar"],
        "incompletos": g["casos"] - g["sin_marcar"],
        "casos_por_trabajador": round(g["casos"] / len(g["personas"]), 2)
                                if g["personas"] else 0,
    } for g in equipos.values()]
    supervisores.sort(key=lambda x: -x["casos"])

    conteo: dict = {}
    for x in revisar:
        conteo[x["motivo"]] = conteo.get(x["motivo"], 0) + 1

    completos = [f for f in filas if f.get("estado") == "completo"]
    dias = sorted({str(f["fecha"]) for f in filas})
    esperados = len(padron) * len(dias) if dias else len(padron)

    return {
        "vacio": not revisar,
        "total": {
            "casos": len(revisar),
            "incompletos": len(incompletos),
            "sin_marcar": len(ausentes),
            "trabajadores_activos": len(padron),
            "registros_completos": len(completos),
            "esperados": esperados,
            "pct_sin_marcacion": _pct(len(revisar), esperados),
        },
        "revisar": revisar[:500],
        "total_revisar": len(revisar),
        "por_motivo": [{"motivo": k, "casos": v}
                       for k, v in sorted(conteo.items(), key=lambda x: -x[1])],
        "supervisores": supervisores,
        "sup_mas_casos": supervisores[:top],
    }
