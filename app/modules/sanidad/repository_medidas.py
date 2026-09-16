"""
PalmaData · Sanidad · Medidas vegetativas · Repositorio
=======================================================
Mismo patrón de Strategus sobre plantacion.medidas_vegetativas: con
erróneos (cat_palma_id contra cat_palma), sin duplicados. Filtros de fecha
del evento, actualización, lote, evaluador y UMA.

Lo nuevo es la UMA: se muestra el `codigo` de nut_uma y se corrige como el
lote — la web elige un código y aquí viaja el nut_uma_id.

Un solo apartado: la revisión y la descarga van en la misma pantalla.
"""
from ...core import db

# Las 16 medidas ancho/largo, para no escribirlas a mano en cada consulta.
MEDIDAS = [f"{t}_{n}" for n in range(1, 9) for t in ("ancho", "largo")]


# ============================================================
#  CATÁLOGOS
# ============================================================

def listar_evaluadores() -> list[dict]:
    return db.fetch_all("""
        SELECT evaluador_codigo, nombre, lecturas, desde, hasta
        FROM plantacion.v_medidas_evaluadores
        ORDER BY nombre NULLS LAST
    """)


def listar_umas_con_datos() -> list[dict]:
    """Para el filtro: solo las UMA que tienen registros."""
    return db.fetch_all("""
        SELECT nut_uma_id, codigo, registros
        FROM plantacion.v_medidas_umas ORDER BY codigo NULLS LAST
    """)


def buscar_umas(busqueda: str | None = None, limite: int = 500) -> list[dict]:
    """Para el modal: todas las UMA del catálogo, filtrando por lo escrito."""
    if busqueda and busqueda.strip():
        return db.fetch_all("""
            SELECT nut_uma_id, codigo FROM plantacion.v_cat_umas
            WHERE codigo ILIKE %s ORDER BY codigo LIMIT %s
        """, (f"%{busqueda.strip()}%", limite))
    return db.fetch_all("SELECT nut_uma_id, codigo FROM plantacion.v_cat_umas LIMIT %s", (limite,))


def listar_lotes(busqueda: str | None = None, limite: int = 500) -> list[dict]:
    if busqueda and busqueda.strip():
        return db.fetch_all("""
            SELECT cat_lote_id, nombre FROM plantacion.cat_lote
            WHERE nombre ILIKE %s ORDER BY nombre LIMIT %s
        """, (f"%{busqueda.strip()}%", limite))
    return db.fetch_all("SELECT cat_lote_id, nombre FROM plantacion.cat_lote ORDER BY nombre LIMIT %s", (limite,))


def fechas_disponibles(limite: int = 90) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha, COUNT(*) AS registros
        FROM plantacion.v_medidas_revision WHERE NOT anulado
        GROUP BY fecha ORDER BY fecha DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    return db.fetch_all("""
        SELECT fecha_actualizacion AS fecha, COUNT(*) AS registros
        FROM plantacion.v_medidas_revision
        GROUP BY fecha_actualizacion ORDER BY fecha_actualizacion DESC LIMIT %s
    """, (limite,))


# ============================================================
#  REVISIÓN
# ============================================================

_FILTROS = """
    WHERE (%s::date IS NULL OR v.fecha >= %s::date)
      AND (%s::date IS NULL OR v.fecha <= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion >= %s::date)
      AND (%s::date IS NULL OR v.fecha_actualizacion <= %s::date)
      AND (%s::bigint IS NULL OR v.cat_lote_id = %s::bigint)
      AND (%s::integer IS NULL OR v.evaluador_codigo = %s::integer)
      AND (%s::integer IS NULL OR v.nut_uma_id = %s::integer)
"""

_ORDEN = ["fecha_desde", "fecha_hasta", "actualiza_desde",
          "actualiza_hasta", "cat_lote_id", "evaluador", "nut_uma_id"]


def _params(f: dict) -> list:
    salida: list = []
    for clave in _ORDEN:
        salida.extend([f.get(clave), f.get(clave)])
    return salida


def revision(filtros: dict, ver_anulados: bool = False,
             solo_erroneos: bool = False, limite: int = 1000) -> list[dict]:
    sql = f"""
        SELECT v.medidas_vegetativas_id, v.id_unico, v.fecha, v.hora,
               v.evaluador, v.evaluador_codigo, v.lote, v.cat_lote_id,
               v.linea, v.palma, v.cat_palma_id, v.uma, v.nut_uma_id,
               v.num_foliolos, v.long_peciolo, v.anch_peciolo, v.prof_peciolo,
               v.long_raquis, {", ".join("v." + m for m in MEDIDAS)},
               v.hoja, v.hojas_verdes, v.niv_foliar, v.latitud, v.longitud,
               v.observaciones, v.erroneo, v.anulado, v.fecha_actualizacion,
               v.corregido_por, v.corregido_at, v.anulado_por, v.anulado_motivo
        FROM plantacion.v_medidas_revision v
    """ + _FILTROS
    params = _params(filtros)
    sql += " AND v.anulado" if ver_anulados else " AND NOT v.anulado"
    if solo_erroneos:
        sql += " AND v.erroneo"
    sql += " ORDER BY v.fecha DESC, v.lote, v.linea, v.palma LIMIT %s"
    params.append(limite)
    return db.fetch_all(sql, tuple(params))


def resumen(filtros: dict) -> dict:
    fila = db.fetch_one("""
        SELECT * FROM plantacion.medidas_resumen(
            %s::date, %s::date, %s::date, %s::date, %s::bigint, %s::integer, %s::integer)
    """, tuple(filtros.get(k) for k in _ORDEN))
    return dict(fila) if fila else {}


# ============================================================
#  CORRECCIONES
# ============================================================

def corregir_lote(ids: list[int], cat_lote_id: int, usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.medidas_corregir_lote(%s, %s, %s::text) AS n",
                    (ids, cat_lote_id, usuario))
        return (cur.fetchone() or {}).get("n", 0)


def corregir_registro(id_registro: int, usuario: str, campos: dict) -> int:
    with db.get_cursor() as cur:
        cur.execute("""
            SELECT plantacion.medidas_corregir_registro(
                %s, %s::text, %s::bigint, %s::integer, %s::integer, %s::integer) AS n
        """, (id_registro, usuario, campos.get("cat_lote_id"),
              campos.get("linea"), campos.get("palma"), campos.get("nut_uma_id")))
        return (cur.fetchone() or {}).get("n", 0)


def anular(ids: list[int], usuario: str, motivo: str | None = None) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.medidas_anular(%s, %s::text, %s::varchar) AS n",
                    (ids, usuario, motivo))
        return (cur.fetchone() or {}).get("n", 0)


def reactivar(ids: list[int], usuario: str) -> int:
    with db.get_cursor() as cur:
        cur.execute("SELECT plantacion.medidas_reactivar(%s, %s::text) AS n", (ids, usuario))
        return (cur.fetchone() or {}).get("n", 0)


# ============================================================
#  DESCARGA (Excel)
# ============================================================
# La misma consulta de la pantalla, con los mismos filtros: lo que se ve es
# exactamente lo que baja. Solo cambia el tope, para que quepa el período.

def para_excel(filtros: dict, ver_anulados: bool, solo_erroneos: bool) -> list[dict]:
    return revision(filtros, ver_anulados, solo_erroneos, limite=50000)
