"""
PalmaData · Cargar datos · Catálogo de tablas destino
=====================================================
Qué archivo alimenta qué tabla y cuál es su columna anti-duplicados.

El nombre del archivo trae la tabla, la fecha y el número de orden:
    san_enf_lectura_20260904_2.xlsx
    └── tabla ──────┘ └fecha┘ └nº┘
"""
import re

# La columna de control NO es la misma en todas las tablas: la app usa
# `id` en las de sanidad y polinización, `id_unico` en las de supervisión
# y `idunico` en los tracks. Es la columna que lleva el índice único y la
# que hace que subir dos veces el mismo archivo no duplique nada.
TABLAS: dict[str, dict] = {
    "san_enf_lectura":                {"conflicto": "id"},
    "san_enf_tratamiento":            {"conflicto": "id"},
    "propolinizacion":                {"conflicto": "id"},
    "sanplagaslectura":               {"conflicto": "id"},
    "sanstrategus":                   {"conflicto": "id"},
    "santrampalectura":               {"conflicto": "id"},
    "supercosechalote":               {"conflicto": "id_unico"},
    "supercosechavagon":              {"conflicto": "id_unico"},
    "pro_ordenes_super_poli_detalle": {"conflicto": "id_unico"},

    # Los tracks entran a la temporal y un cron los pasa a tracksmovil,
    # vaciándola. Si el archivo se vuelve a subir DESPUÉS de que el cron
    # corrió, la temporal está vacía y el ON CONFLICT no vería nada: por eso
    # además se descartan los idunico que ya están en la tabla definitiva.
    "tracksmoviltemp": {"conflicto": "idunico",
                        "tambien_revisar": ("tracksmovil", "idunico")},

    # La app también exporta estos dos (ExportManager.modulos). Sin ellos,
    # sus archivos se rechazarían con «no reconozco la tabla».
    "sesionesmaquinaria":             {"conflicto": "idunico"},
    "super_tiempos":                  {"conflicto": "id_unico"},

    # Antes se rechazaba: su Excel no traía columna de control. La app ya
    # genera `id_movil` (un UUID de 36 caracteres), así que se carga como
    # las demás. Requiere el script 35, que agrega esa columna a la tabla
    # y le pone el índice único.
    "propoleninicialfinal":           {"conflicto": "id_movil"},

    # Módulo Medidas vegetativas (formulario 40). La tabla ya trae su
    # restricción UNIQUE (id), así que no hace falta crearla.
    "medidas_vegetativas":            {"conflicto": "id"},
}

# ═══════════════════════════════════════════════════════════════════════════
# VALORES FIJOS QUE PONE server.py Y EL EXCEL NO TRAE
#
# Los endpoints de la app escriben varias columnas con un literal, no con un
# dato del registro. El Excel se arma con las columnas de SQLite, así que no
# las incluye. Sin esto, un registro cargado por Excel quedaría con NULL
# donde el mismo registro por red queda en 0.
#
# Suena menor pero no lo es: un filtro `WHERE orden_supervision = 0` deja
# fuera los NULL, y ahí las dos vías dejarían de dar el mismo resultado.
#
# Solo se aplican cuando el Excel NO trae esa columna y la tabla sí la tiene.
# Si mañana server.py cambia un literal, se cambia aquí y las dos vías
# vuelven a coincidir.
# ═══════════════════════════════════════════════════════════════════════════
FIJOS: dict[str, dict] = {
    "san_enf_lectura": {
        "san_error_registro_id": 0, "epi": 0, "evento_inicial": 0,
        "orden_labor": 0, "orden_supervision": 0,
    },
    "san_enf_tratamiento": {
        "san_enf_lectura_id": 0,
    },
    "propolinizacion": {
        # buenas, ayudadas y dobles son las que el trigger usa para calcular
        # polinizada / sinpolinizar. En 0 o en NULL el resultado del trigger
        # es el mismo, pero se ponen en 0 para que la fila quede idéntica.
        "buenas": 0, "ayudadas": 0, "dobles": 0,
        "poleninicial": 0, "polenfinal": 0, "parada": 0, "androgena": 0,
        "orden_supervision": 0,
    },
    "sanplagaslectura": {
        "orden_supervision": 0, "origen_orden_super": 0, "saninsectoestadoid": 0,
    },
    "pro_ordenes_super_poli_detalle": {
        # `cumple` = 1 fijo: esta es la razón de que en la base esa columna
        # solo tenga unos y nunca ceros, como salió en el diagnóstico del
        # apartado de Supervisión · Polinización. No es un dato calculado.
        "id_orden": 0, "cumple": 1, "polinizador_sin_orden": 0,
        "flor_dejada_aplicacion1": 0, "flor_dejada_aplicacion2": 0,
        "flor_dejada_aplicacion3": 0,
    },
}

# Columnas que el Excel trae porque están en SQLite, pero que server.py no
# manda por red. Si la tabla no las tiene, se omiten en silencio en vez de
# avisar en cada carga: no es un problema, es cómo está hecha la app.
EXTRAS_CONOCIDAS = {"equipo", "sincronizado"}

# Reconocidas pero que no se cargan, con el motivo a la vista. Hoy está
# vacío: propoleninicialfinal estuvo aquí hasta que la app empezó a generar
# su `id_movil`. Se conserva la estructura por si vuelve a hacer falta.
NO_SOPORTADAS: dict[str, str] = {}


def tabla_de_archivo(nombre: str) -> tuple[str | None, str | None, int | None]:
    """
    Del nombre del archivo saca la tabla, la fecha y el número de orden.

        san_enf_lectura_20260904_2.xlsx -> ('san_enf_lectura', '20260904', 2)

    Devuelve (None, ...) si el nombre no sigue el patrón. El nombre de la
    tabla puede llevar guiones bajos, así que se recortan por la derecha:
    lo último es el número, antes la fecha, y todo lo anterior es la tabla.
    """
    base = re.sub(r"\.xlsx?$", "", nombre.strip(), flags=re.I)
    m = re.match(r"^(?P<tabla>.+)_(?P<fecha>\d{8})_(?P<orden>\d+)$", base)
    if m:
        return m.group("tabla").lower(), m.group("fecha"), int(m.group("orden"))

    # Sin fecha ni número: puede ser un archivo renombrado a mano
    m = re.match(r"^(?P<tabla>.+?)(?:_\d{8})?$", base)
    if m:
        return m.group("tabla").lower(), None, None
    return None, None, None


def normalizar(nombre: str) -> str:
    """
    Deja solo letras y números en minúscula, para comparar nombres de
    columna sin depender de los guiones bajos.

    Hace falta porque el Excel y la base no siempre los escriben igual:
        cat_lote_id       -> catloteid       (propolinizacion, sanstrategus)
        insecto_id        -> insectoid       (sanplagaslectura)
        estado_insecto_id -> estadoinsectoid
        niv_foliar        -> nivfoliar
        san_trampa_id     -> santrampaid     (santrampalectura)
        san_tipo_trampa   -> santipotrampa
    Todas siguen la misma regla, así que una normalización las resuelve
    todas y también las que aparezcan mañana.
    """
    return re.sub(r"[^a-z0-9]", "", str(nombre or "").lower())
