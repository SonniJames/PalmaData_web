"""
PalmaData · Fertilización · Carga del Excel completo
====================================================
Lee el archivo del ingeniero agrónomo tal como lo entrega:
columnas A a ED, filas 1 a 157 (o las que traiga).

No recalcula nada. Solo valida, limpia y reparte cada bloque
a su tabla, según el mapa de columnas.py
"""
import unicodedata
from io import BytesIO

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from . import columnas as COL

HOJA_DATOS = "RESULTADOS"


def _num(valor, entero=False):
    """Convierte a número. Texto no numérico o vacío -> None."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, str):
        v = valor.strip().replace(",", ".")
        if v in ("", "-", "—", "#N/A", "#¡DIV/0!", "#DIV/0!", "#VALUE!", "#¡VALOR!"):
            return None
        valor = v
    try:
        f = float(valor)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):   # NaN o infinito
        return None
    return int(round(f)) if entero else f


def _txt(valor):
    if valor is None:
        return None
    t = str(valor).strip()
    return t or None


def leer_excel(contenido: bytes) -> tuple[list[dict], list[str]]:
    """
    Devuelve (lotes, advertencias).

    Cada lote es un dict:
      {
        "fila_excel": 4,
        "fert_lote":       {...},   # columnas A-K
        "fert_foliar":     {...},   # L-W
        "fert_secundarios":{...},   # X-AJ
        ...
      }
    """
    advertencias: list[str] = []

    try:
        wb = load_workbook(BytesIO(contenido), data_only=True, read_only=True)
    except Exception as e:
        return [], [f"No se pudo abrir el archivo: {e}"]

    if HOJA_DATOS in wb.sheetnames:
        ws = wb[HOJA_DATOS]
    else:
        ws = wb[wb.sheetnames[0]]
        advertencias.append(
            f"No se encontró la hoja '{HOJA_DATOS}'. Se leyó '{ws.title}'.")

    filas = list(ws.iter_rows(values_only=True))

    if len(filas) <= COL.PRIMERA_FILA_DATOS:
        return [], ["El archivo no tiene filas de datos."]

    ancho = max(len(f) for f in filas)
    if ancho < COL.ULTIMA_COLUMNA + 1:
        advertencias.append(
            f"El archivo llega hasta la columna {get_column_letter(ancho)} "
            f"y se esperaban datos hasta ED. Las columnas faltantes quedarán vacías.")

    lotes: list[dict] = []
    vistos: set[str] = set()

    for n, fila in enumerate(filas[COL.PRIMERA_FILA_DATOS:],
                             start=COL.PRIMERA_FILA_DATOS + 1):
        if fila is None:
            continue

        ident = _txt(fila[3]) if len(fila) > 3 else None
        if not ident:
            continue  # fila vacía o de totales al pie

        clave = ident.lower()
        if clave in vistos:
            advertencias.append(
                f"Fila {n}: el lote «{ident}» está repetido. Se omite.")
            continue
        vistos.add(clave)

        registro: dict = {"fila_excel": n}

        for tabla, cols in COL.BLOQUES.items():
            datos = {}
            for indice, campo in cols:
                valor = fila[indice] if indice < len(fila) else None
                if campo in COL.TEXTO:
                    datos[campo] = _txt(valor)
                else:
                    datos[campo] = _num(valor, entero=(campo in COL.ENTEROS))
            registro[tabla] = datos

        lotes.append(registro)

    if not lotes:
        advertencias.append(
            "No se encontró ningún lote. Revisa que los nombres estén en la columna D "
            "y que los datos empiecen en la fila 4.")

    # Aviso de calidad: lotes sin toneladas calculadas
    sin_plan = [l["fert_lote"]["identificacion"] for l in lotes
                if not any(l["fert_toneladas"].get(c) for c, _, _ in COL.PRODUCTOS)]
    if sin_plan:
        advertencias.append(
            f"{len(sin_plan)} lote(s) sin toneladas en el bloque final "
            f"(columnas DX-ED): {', '.join(sin_plan[:5])}"
            + ("…" if len(sin_plan) > 5 else ""))

    return lotes, advertencias


# ============================================================
#  Generación del formato en blanco
# ============================================================

def generar_formato() -> bytes:
    """
    Genera el Excel de formato: misma estructura A–ED que el archivo
    del agrónomo, con las tres filas de encabezado y sin datos.

    El usuario copia y pega sus valores aquí, y así no hay diferencias
    de estructura entre archivos.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = HOJA_DATOS

    # --- Fila 1: títulos de bloque ---
    titulos = {
        23:  "CÁLCULOS SECUNDARIOS",
        36:  "ÍNDICE DE BALANCE",
        47:  "DIFERENCIA DE CONCENTRACIÓN CON EL NIVEL ÓPTIMO",
        58:  "REQUERIMIENTO PARA NIVELACIÓN FOLIAR",
        66:  "REQUERIMIENTO POR EXTRACCIÓN EN COSECHA ESPERADA",
        74:  "REQUERIMIENTO TOTAL PARA EL RENDIMIENTO ESPERADO",
        82:  "EQUIVALENTE EN ÓXIDO",
        89:  "MÉTODO 1 · FERTILIZANTES SIMPLES (kg/palma)",
        103: "MÉTODO 1 · KG POR LOTE",
        111: "MÉTODO 2 · GRADO COMPUESTO Y COMPLEMENTOS",
        127: "TONELADAS POR LOTE",
    }
    fila1 = [None] * (COL.ULTIMA_COLUMNA + 1)
    for i, t in titulos.items():
        fila1[i] = t
    ws.append(fila1)

    # --- Fila 2: encabezado de cada columna ---
    encabezados = {
        0: "Código", 1: "Zona", 2: "Rangos Edad", 3: "Identificación",
        4: "UMA", 5: "Material de Siembra", 6: "siembra", 7: "Palmas",
        8: "Número de la hoja muestreada", 9: "M.S.T", 10: "TONS",
        11: "Nitrógeno", 12: "Fósforo", 13: "Potasio", 14: "Calcio",
        15: "Magnesio", 16: "Cloruros", 17: "Azufre", 18: "Boro",
        19: "Hierro", 20: "Cobre", 21: "Manganeso", 22: "Zinc",
        23: "Ca+Mg+K", 24: "Sat.K", 25: "Sat.Ca", 26: "Sat.Mg",
        27: "Ca/Mg", 28: "Ca/K", 29: "Mg/K", 30: "(Ca+Mg)/K",
        31: "N/K", 32: "N/P", 33: "K/P", 34: "Ca/B", 35: "Fe/Mn",
        89: "DAP", 91: "Nca", 93: "KCL", 94: "KIESERITA",
        96: "Sulfato doble Potasio y Magnesio", 98: "AZUFRE",
        99: "BORATO", 100: "ZINC",
        103: "DAP", 104: "Nca", 105: "KCL", 106: "KIESERITA",
        107: "Sulfato KMg", 108: "AZUFRE", 109: "BORATO",
        110: "SULFATO DE ZINC",
        112: "N", 113: "P", 114: "K", 115: "Mg", 116: "B",
        117: "Nca", 119: "Rafos", 122: "PathenKali / Sulfato K Mg",
        124: "Kieser", 125: "Boro",
    }
    nut = ["N", "P", "K", "Ca", "Mg", "S", "B", "Cu", "Fe", "Mn", "Zn"]
    for j, n in enumerate(nut):
        encabezados[36 + j] = n
    fila2 = [None] * (COL.ULTIMA_COLUMNA + 1)
    for i, t in encabezados.items():
        fila2[i] = t
    ws.append(fila2)

    # --- Fila 3: unidades y referencias ---
    unidades = {}
    for i in range(11, 18):
        unidades[i] = "%"
    for i in range(18, 23):
        unidades[i] = "mg/kg"
    dif = ["N (%)", "P (%)", "K (%)", "Ca (%)", "Mg (%)", "S (%)",
           "B (ppm)", "Cu (ppm)", "Fe (ppm)", "Mn (ppm)", "Zn (ppm)"]
    for j, t in enumerate(dif):
        unidades[47 + j] = t
    req8 = ["N", "P", "K", "Ca", "Mg", "S", "B", "Zn"]
    for base in (58, 66, 74):
        for j, t in enumerate(req8):
            unidades[base + j] = t
    for j, t in enumerate(["N", "P2O5", "K2O", "CaO", "MgO", "S", "B2O3"]):
        unidades[82 + j] = t
    for j, t in enumerate(["Grado 13-5-27-5(Mg)", "NCa", "Rafos", "KSOMgO",
                           "KIESE", "Borax 48%", "ZnSO4"]):
        unidades[127 + j] = t
    for i in range(103, 111):
        unidades[i] = "Kg/ lote"
    fila3 = [None] * (COL.ULTIMA_COLUMNA + 1)
    for i, t in unidades.items():
        fila3[i] = t
    ws.append(fila3)

    # --- Estilo ---
    verde = PatternFill("solid", fgColor="16412B")
    verde2 = PatternFill("solid", fgColor="2F7D4F")
    crema = PatternFill("solid", fgColor="EAE5D9")

    for celda in ws[1]:
        if celda.value:
            celda.font = Font(bold=True, color="FFFFFF", size=10)
            celda.fill = verde
            celda.alignment = Alignment(horizontal="center", vertical="center")
    for celda in ws[2]:
        celda.font = Font(bold=True, color="FFFFFF", size=10)
        celda.fill = verde2
        celda.alignment = Alignment(horizontal="center", wrap_text=True,
                                    vertical="center")
    for celda in ws[3]:
        celda.font = Font(italic=True, size=9)
        celda.fill = crema
        celda.alignment = Alignment(horizontal="center")

    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 44
    for i in range(COL.ULTIMA_COLUMNA + 1):
        letra = get_column_letter(i + 1)
        ws.column_dimensions[letra].width = 26 if i == 3 else (
            18 if i in (0, 1, 2, 5) else 12)

    ws.freeze_panes = "E4"

    # --- Hoja de instrucciones ---
    guia = wb.create_sheet("INSTRUCCIONES")
    texto = [
        ["PalmaData · Formato de carga · Módulo Fertilización"],
        [],
        ["Cómo usar este archivo"],
        ["1. Abre tu Excel de análisis foliar del año."],
        ["2. Copia el rango de datos completo (desde la fila 4 hacia abajo,"],
        ["   columnas A hasta ED)."],
        ["3. Pégalo aquí en la hoja RESULTADOS, empezando en la celda A4."],
        ["   Usa Pegado especial → Valores, para que no viajen las fórmulas."],
        ["4. Guarda y súbelo desde el módulo Fertilización de PalmaData."],
        [],
        ["Reglas"],
        ["· La columna D (Identificación) es obligatoria: es la que identifica al lote."],
        ["· No cambies el orden ni el número de columnas."],
        ["· Las filas de totales al pie no se cargan: el sistema los recalcula."],
        ["· Si vuelves a cargar el mismo año, los lotes se actualizan (no se duplican)."],
        [],
        ["Qué calcula PalmaData"],
        ["El sistema NO recalcula tus fórmulas agronómicas: las guarda tal cual."],
        ["Solo calcula los totales por zona y edad, los costos (toneladas × precio)"],
        ["y los indicadores de las gráficas."],
        [],
        ["Los precios se ingresan desde la pestaña Parámetros de la web,"],
        ["y quedan guardados por año."],
    ]
    for linea in texto:
        guia.append(linea)
    guia["A1"].font = Font(bold=True, size=14, color="16412B")
    for fila in (3, 11, 17):
        guia.cell(row=fila, column=1).font = Font(bold=True, size=11)
    guia.column_dimensions["A"].width = 78

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
