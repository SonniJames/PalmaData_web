"""
PalmaData · Fertilización · Formato del Excel
=============================================
ÚNICA FUENTE DE VERDAD sobre la estructura del archivo de carga.

El Excel tiene una HOJA por concepto. Todas siguen la misma regla:

    · Fila 1  -> nombres de las columnas
    · Columna A -> identificación del lote (la llave que une las hojas)
    · De la columna B en adelante -> los datos

Hojas:
    identificacion  -> quién es cada lote (uma, sector, zona, palmas…)
    anal_foliar     -> resultado del laboratorio, por nutriente
    ind_balan       -> índice de balance, por nutriente
    reque_fert      -> fertilizantes requeridos y su cantidad

PARA AGREGAR UNA HOJA NUEVA en el futuro:
    1. Añade su definición a HOJAS
    2. Crea su tabla en la base (una columna JSONB basta)
    3. Guárdala en repository.guardar_lote()
No hay que tocar nada más.
"""

# ------------------------------------------------------------
# Nombres de las hojas
# ------------------------------------------------------------
HOJA_IDENTIFICACION = "identificacion"
HOJA_FOLIAR = "anal_foliar"
HOJA_BALANCE = "ind_balan"
HOJA_REQUERIMIENTO = "reque_fert"
HOJA_INSTRUCCIONES = "instrucciones"

# Nombres alternativos aceptados, por si el usuario los escribe distinto
ALIAS_HOJAS = {
    HOJA_IDENTIFICACION: ["identificacion", "identificación", "ident", "lotes"],
    HOJA_FOLIAR:         ["anal_foliar", "analfoliar", "analisis_foliar",
                          "análisis foliar", "foliar"],
    HOJA_BALANCE:        ["ind_balan", "indbalan", "indice_balance",
                          "índice de balance", "balance"],
    HOJA_REQUERIMIENTO:  ["reque_fert", "requefert", "requerimiento",
                          "requerimiento_fertilizantes", "fertilizantes"],
}

# ------------------------------------------------------------
# Hoja "identificacion": columnas conocidas
#   encabezado normalizado -> campo de la tabla fert_lote
# Cualquier columna que no esté aquí se guarda en `extra`.
# ------------------------------------------------------------
# Nota: `empresa` NO se guarda como campo del lote. La empresa se
# elige al cargar y define la campaña. Si la columna viene en el Excel,
# queda en `extra` y el cargador la usa para VALIDAR que el archivo
# corresponda a la empresa seleccionada.
CAMPOS_IDENTIFICACION = {
    "identificacion": "identificacion",
    "identificaciones": "identificacion",
    "lote": "identificacion",
    "uma": "uma",
    "sector": "sector",
    "finca": "sector",
    "zona": "zona",
    "rangoedad": "rango_edad",
    "rangosedad": "rango_edad",
    "edad": "rango_edad",
    "palmas": "palmas",
    "hectareas": "hectareas",
    "has": "hectareas",
    "ha": "hectareas",
    "area": "hectareas",
    "material": "material",
    "materialdesiembra": "material",
    "siembra": "siembra",
    "aniosiembra": "siembra",
    "codigo": "codigo",
    "hoja": "hoja",
    "numerodelahojamuestreada": "hoja",
    "mst": "mst",
    "tons": "tons",
    "toneladas": "tons",
    "cosechaesperada": "tons",
}

TEXTO = {"identificacion", "sector", "zona", "rango_edad", "material", "codigo"}
ENTEROS = {"uma", "palmas", "siembra", "hoja"}
DECIMALES = {"hectareas", "mst", "tons"}

# ------------------------------------------------------------
# Definición de las hojas de datos (las que van a JSONB)
#   clave interna -> (nombre de hoja, tabla destino, etiqueta)
# ------------------------------------------------------------
HOJAS_DATOS = {
    "foliar":        (HOJA_FOLIAR,        "fert_foliar",        "Análisis foliar"),
    "balance":       (HOJA_BALANCE,       "fert_balance",       "Índice de balance"),
    "requerimiento": (HOJA_REQUERIMIENTO, "fert_requerimiento", "Fertilizantes requeridos"),
}

# ------------------------------------------------------------
# Orden sugerido de nutrientes, para que las tablas salgan
# ordenadas de forma natural y no alfabética.
# Los que no estén en la lista van al final, en el orden del Excel.
# ------------------------------------------------------------
ORDEN_NUTRIENTES = ["N", "P", "K", "Ca", "Mg", "Cl", "S",
                    "B", "Fe", "Cu", "Mn", "Zn"]


def ordenar_nutrientes(claves) -> list[str]:
    """Ordena por la secuencia agronómica habitual."""
    conocidos = [n for n in ORDEN_NUTRIENTES if n in claves]
    otros = sorted(k for k in claves if k not in ORDEN_NUTRIENTES)
    return conocidos + otros
