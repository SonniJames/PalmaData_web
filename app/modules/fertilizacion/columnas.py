"""
PalmaData · Fertilización · Mapa de columnas del Excel
======================================================
ÚNICA FUENTE DE VERDAD sobre la estructura del archivo.

El Excel del ingeniero agrónomo va de la columna A a la ED (134 columnas)
y de la fila 1 a la 157. Aquí se define qué columna corresponde a qué campo
y a qué tabla de la base de datos.

Si el formato cambia (se agrega una columna, se mueve un bloque),
se ajusta SOLO este archivo: el cargador, el repositorio y la web
se acomodan solos.

Estructura de la hoja RESULTADOS:
  fila 1 (índice 0) -> títulos de bloque    (ej. "EQUIVALENTE EN OXIDO")
  fila 2 (índice 1) -> encabezado           (ej. "Nitrógeno")
  fila 3 (índice 2) -> unidad / referencia  (ej. "%", "2.4")
  fila 4 en adelante -> un lote por fila
"""

# Fila (base 0) donde empiezan los datos
PRIMERA_FILA_DATOS = 3

# ------------------------------------------------------------
# BLOQUES: nombre_tabla -> lista de (indice_columna, campo_bd)
# ------------------------------------------------------------

BASE = [
    (0,  "codigo"),          # A  · Código de laboratorio (F25-06980)
    (1,  "zona"),            # B  · Zona
    (2,  "rango_edad"),      # C  · Rango de edad (tal como lo pone el agrónomo)
    (3,  "identificacion"),  # D  · Nombre del lote  ← LLAVE
    (4,  "uma"),             # E  · Número de UMA
    (5,  "material"),        # F  · Material de siembra
    (6,  "siembra"),         # G  · Año de siembra
    (7,  "palmas"),          # H  · Censo de palmas
    (8,  "hoja"),            # I  · Hoja muestreada
    (9,  "mst"),             # J  · Materia seca
    (10, "tons"),            # K  · Toneladas de fruto esperadas
]

FOLIAR = [               # L–W · Resultado del laboratorio
    (11, "n"), (12, "p"), (13, "k"), (14, "ca"), (15, "mg"), (16, "cl"),
    (17, "s"), (18, "b"), (19, "fe"), (20, "cu"), (21, "mn"), (22, "zn"),
]

SECUNDARIOS = [          # X–AJ · Relaciones entre nutrientes
    (23, "ca_mg_k"), (24, "sat_k"), (25, "sat_ca"), (26, "sat_mg"),
    (27, "ca_mg"), (28, "ca_k"), (29, "mg_k"), (30, "ca_mg_sobre_k"),
    (31, "n_k"), (32, "n_p"), (33, "k_p"), (34, "ca_b"), (35, "fe_mn"),
]

INDICE = [               # AK–AU · Índice de balance (% sobre óptimo)
    (36, "n"), (37, "p"), (38, "k"), (39, "ca"), (40, "mg"), (41, "s"),
    (42, "b"), (43, "cu"), (44, "fe"), (45, "mn"), (46, "zn"),
]

DIFERENCIA = [           # AV–BF · Diferencia con el nivel óptimo
    (47, "n"), (48, "p"), (49, "k"), (50, "ca"), (51, "mg"), (52, "s"),
    (53, "b"), (54, "cu"), (55, "fe"), (56, "mn"), (57, "zn"),
]

# BG–CD · Los mismos 8 nutrientes en tres etapas del requerimiento
NIVELACION = [(58, "niv_n"), (59, "niv_p"), (60, "niv_k"), (61, "niv_ca"),
              (62, "niv_mg"), (63, "niv_s"), (64, "niv_b"), (65, "niv_zn")]

EXTRACCION = [(66, "ext_n"), (67, "ext_p"), (68, "ext_k"), (69, "ext_ca"),
              (70, "ext_mg"), (71, "ext_s"), (72, "ext_b"), (73, "ext_zn")]

TOTAL = [(74, "tot_n"), (75, "tot_p"), (76, "tot_k"), (77, "tot_ca"),
         (78, "tot_mg"), (79, "tot_s"), (80, "tot_b"), (81, "tot_zn")]

REQUERIMIENTO = NIVELACION + EXTRACCION + TOTAL

OXIDO = [                # CE–CK · Equivalente en óxido
    (82, "ox_n"), (83, "ox_p2o5"), (84, "ox_k2o"), (85, "ox_cao"),
    (86, "ox_mgo"), (87, "ox_s"), (88, "ox_b2o3"),
]

SIMPLES = [              # CL–DG · Método 1: fertilizantes simples
    # Aporte por nutriente (kg/palma)
    (89,  "dap_n"),         (90,  "dap_p2o5"),
    (91,  "nca_n"),         (92,  "nca_ca"),
    (93,  "kcl_k2o"),
    (94,  "kieserita_mgo"), (95,  "kieserita_s"),
    (96,  "sulfdoble_mgo"), (97,  "sulfdoble_k2o"),
    (98,  "azufre_s"),      (99,  "borato_b"),
    (100, "zinc_zn"),       (101, "znso4_dosis"),
    (102, "total_dosis"),
    # Kg por lote
    (103, "kg_dap"),        (104, "kg_nca"),      (105, "kg_kcl"),
    (106, "kg_kieserita"),  (107, "kg_sulf_kmg"), (108, "kg_azufre"),
    (109, "kg_borato"),     (110, "kg_znso4"),
]

GRADO = [                # DH–DW · Método 2: grado compuesto + complementos
    (111, "grado_dosis"),
    # Remanente tras aplicar el grado
    (112, "rem_n"), (113, "rem_p"), (114, "rem_k"),
    (115, "rem_mg"), (116, "rem_b"),
    # Complementos
    (117, "nca_dosis"),        (118, "nca_ca"),
    (119, "rafos_n"),          (120, "rafos_dosis"), (121, "rafos_x"),
    (122, "pathenkali_dosis"), (123, "pathenkali_x"),
    (124, "kieserita_dosis"),  (125, "boro_dosis"),
    (126, "total_dosis"),
]

TONELADAS = [            # DX–ED · Resultado final: toneladas por lote
    (127, "t_grado"), (128, "t_nca"), (129, "t_rafos"), (130, "t_ksomgo"),
    (131, "t_kieserita"), (132, "t_borax"), (133, "t_znso4"),
]

# ------------------------------------------------------------
# Registro de bloques -> tabla destino
# ------------------------------------------------------------
BLOQUES = {
    "fert_lote":          BASE,
    "fert_foliar":        FOLIAR,
    "fert_secundarios":   SECUNDARIOS,
    "fert_indice":        INDICE,
    "fert_diferencia":    DIFERENCIA,
    "fert_requerimiento": REQUERIMIENTO,
    "fert_oxido":         OXIDO,
    "fert_simples":       SIMPLES,
    "fert_grado":         GRADO,
    "fert_toneladas":     TONELADAS,
}

# Campos de texto (todo lo demás se guarda como número)
TEXTO = {"codigo", "zona", "rango_edad", "identificacion", "material"}

# Campos enteros
ENTEROS = {"uma", "siembra", "palmas", "hoja"}

ULTIMA_COLUMNA = 133   # ED

# ------------------------------------------------------------
# Productos finales y su precio (para costos)
# La clave enlaza la columna de toneladas con el precio en parámetros.
# ------------------------------------------------------------
PRODUCTOS = [
    ("t_grado",      "grado",      "Grado 13-5-27-5(Mg)"),
    ("t_nca",        "nca",        "Nitrato de calcio"),
    ("t_rafos",      "rafos",      "Rafos 12-24-12"),
    ("t_ksomgo",     "ksomgo",     "PatentKali (K-Mg)"),
    ("t_kieserita",  "kieserita",  "Kieserita"),
    ("t_borax",      "borax",      "Bórax 48%"),
    ("t_znso4",      "znso4",      "Sulfato de zinc"),
]

# Nutrientes con semáforo en el índice de balance
NUTRIENTES = ["n", "p", "k", "ca", "mg", "s", "b", "cu", "fe", "mn", "zn"]

ETIQUETA_NUTRIENTE = {
    "n": "N", "p": "P", "k": "K", "ca": "Ca", "mg": "Mg", "s": "S",
    "b": "B", "cu": "Cu", "fe": "Fe", "mn": "Mn", "zn": "Zn",
}


def columnas_de(tabla: str) -> list[tuple[int, str]]:
    return BLOQUES[tabla]


def todos_los_campos() -> dict[str, list[str]]:
    """tabla -> lista de campos, para construir los INSERT."""
    return {t: [c for _, c in cols] for t, cols in BLOQUES.items()}
