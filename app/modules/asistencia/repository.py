"""
PalmaData · Asistencia · Repositorio
====================================
Todo el SQL del módulo. El router no escribe consultas.

Tres tablas: asis_periodo, asis_trabajador, asis_marcacion.
Las empresas se reciclan de plantacion.fert_empresa.
"""
import json

from ...core import db


# ============================================================
#  EMPRESAS · se reutiliza el catálogo de fertilización
# ============================================================

def listar_empresas(solo_activas: bool = True) -> list[dict]:
    sql = "SELECT id, nombre, nit, orden, activo FROM plantacion.fert_empresa"
    if solo_activas:
        sql += " WHERE activo"
    sql += " ORDER BY orden, nombre"
    return db.fetch_all(sql)


def empresa_por_id(empresa_id: int) -> dict | None:
    return db.fetch_one(
        "SELECT id, nombre FROM plantacion.fert_empresa WHERE id=%s", (empresa_id,))


def empresa_por_defecto() -> dict | None:
    return db.fetch_one("""
        SELECT id, nombre FROM plantacion.fert_empresa
        WHERE activo ORDER BY orden, nombre LIMIT 1
    """)


# ============================================================
#  ZONAS · los huelleros de cada empresa
# ============================================================

def listar_zonas(empresa_id: int | None = None,
                 solo_activas: bool = True) -> list[dict]:
    sql = """
        SELECT z.id, z.empresa_id, z.nombre, z.orden, z.activo,
               e.nombre AS empresa
        FROM plantacion.asis_zona z
        JOIN plantacion.fert_empresa e ON e.id = z.empresa_id
        WHERE 1=1
    """
    params: list = []
    if empresa_id:
        sql += " AND z.empresa_id = %s"
        params.append(empresa_id)
    if solo_activas:
        sql += " AND z.activo"
    sql += " ORDER BY e.orden, z.orden, z.nombre"
    return db.fetch_all(sql, tuple(params))


def zona_por_id(zona_id: int) -> dict | None:
    return db.fetch_one("""
        SELECT z.id, z.nombre, z.empresa_id, e.nombre AS empresa
        FROM plantacion.asis_zona z
        JOIN plantacion.fert_empresa e ON e.id = z.empresa_id
        WHERE z.id = %s
    """, (zona_id,))


def zonas_con_datos(empresa_id: int, anio=None, mes=None) -> list[dict]:
    """Zonas que tienen marcaciones, para el filtro del análisis."""
    sql = """
        SELECT DISTINCT z.id, z.nombre, z.orden
        FROM plantacion.asis_periodo p
        JOIN plantacion.asis_zona z ON z.id = p.zona_id
        WHERE p.empresa_id = %s
    """
    params: list = [empresa_id]
    if anio:
        sql += " AND p.anio = %s"
        params.append(anio)
    if mes:
        sql += " AND p.mes = %s"
        params.append(mes)
    sql += " ORDER BY z.orden, z.nombre"
    return db.fetch_all(sql, tuple(params))


# ============================================================
#  PERÍODOS
# ============================================================

def listar_periodos(empresa_id: int | None = None) -> list[dict]:
    sql = """
        SELECT p.id, p.anio, p.mes, p.dias, p.archivo, p.cargado_por,
               p.created_at, p.empresa_id, p.zona_id, p.formato,
               e.nombre AS empresa, z.nombre AS zona,
               COUNT(DISTINCT m.trabajador_id) AS trabajadores,
               COUNT(m.id) AS marcaciones
        FROM plantacion.asis_periodo p
        JOIN plantacion.fert_empresa e ON e.id = p.empresa_id
        JOIN plantacion.asis_zona z    ON z.id = p.zona_id
        LEFT JOIN plantacion.asis_marcacion m ON m.periodo_id = p.id
        WHERE 1=1
    """
    params: list = []
    if empresa_id:
        sql += " AND p.empresa_id = %s"
        params.append(empresa_id)
    sql += """ GROUP BY p.id, e.nombre, e.orden, z.nombre, z.orden
               ORDER BY p.anio DESC, p.mes DESC, e.orden, z.orden"""
    return db.fetch_all(sql, tuple(params))


def anios_disponibles(empresa_id: int, zona_id: int | None = None) -> list[int]:
    sql = "SELECT DISTINCT anio FROM plantacion.asis_periodo WHERE empresa_id = %s"
    params: list = [empresa_id]
    if zona_id:
        sql += " AND zona_id = %s"
        params.append(zona_id)
    sql += " ORDER BY anio DESC"
    return [f["anio"] for f in db.fetch_all(sql, tuple(params))]


def meses_disponibles(empresa_id: int, anio: int,
                      zona_id: int | None = None) -> list[int]:
    sql = """SELECT DISTINCT mes FROM plantacion.asis_periodo
             WHERE empresa_id = %s AND anio = %s"""
    params: list = [empresa_id, anio]
    if zona_id:
        sql += " AND zona_id = %s"
        params.append(zona_id)
    sql += " ORDER BY mes"
    return [f["mes"] for f in db.fetch_all(sql, tuple(params))]


def obtener_o_crear_periodo(cur, empresa_id: int, zona_id: int, anio: int,
                            mes: int, dias: int, formato: int = 1,
                            archivo=None, usuario=None) -> int:
    """El período es empresa + ZONA + año + mes: cada huellero va aparte."""
    cur.execute("""
        SELECT id FROM plantacion.asis_periodo
        WHERE empresa_id=%s AND zona_id=%s AND anio=%s AND mes=%s
    """, (empresa_id, zona_id, anio, mes))
    fila = cur.fetchone()
    if fila:
        cur.execute("""
            UPDATE plantacion.asis_periodo
            SET dias=%s, formato=%s, archivo=%s, cargado_por=%s WHERE id=%s
        """, (dias, formato, archivo, usuario, fila["id"]))
        return fila["id"]

    cur.execute("""
        INSERT INTO plantacion.asis_periodo
            (empresa_id, zona_id, anio, mes, dias, formato, archivo, cargado_por)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id
    """, (empresa_id, zona_id, anio, mes, dias, formato, archivo, usuario))
    return cur.fetchone()["id"]


def borrar_marcaciones(cur, periodo_id: int) -> int:
    cur.execute("DELETE FROM plantacion.asis_marcacion WHERE periodo_id=%s",
                (periodo_id,))
    return cur.rowcount


def eliminar_periodo(empresa_id: int, zona_id: int, anio: int, mes: int) -> bool:
    with db.get_cursor() as cur:
        cur.execute("""
            DELETE FROM plantacion.asis_periodo
            WHERE empresa_id=%s AND zona_id=%s AND anio=%s AND mes=%s
        """, (empresa_id, zona_id, anio, mes))
        return cur.rowcount > 0


# ============================================================
#  TRABAJADORES
# ============================================================

def obtener_o_crear_trabajador(cur, empresa_id: int, zona_id: int,
                               codigo: str, nombre: str) -> int:
    """
    La llave incluye la ZONA porque cada huellero numera a su gente
    por su cuenta: el empleado 65 de Peroles y el 65 de Castillo son
    personas distintas. Dentro de una zona, el código une el histórico
    de la persona entre meses.
    """
    cur.execute("""
        INSERT INTO plantacion.asis_trabajador
            (empresa_id, zona_id, codigo, nombre)
        VALUES (%s,%s,%s,%s)
        ON CONFLICT (empresa_id, zona_id, codigo)
            DO UPDATE SET nombre = EXCLUDED.nombre
        RETURNING id
    """, (empresa_id, zona_id, str(codigo), nombre))
    return cur.fetchone()["id"]


def listar_trabajadores(empresa_id: int, zona_id: int | None = None) -> list[dict]:
    sql = """
        SELECT t.id, t.codigo, t.nombre, t.activo, t.zona_id, z.nombre AS zona
        FROM plantacion.asis_trabajador t
        JOIN plantacion.asis_zona z ON z.id = t.zona_id
        WHERE t.empresa_id = %s
    """
    params: list = [empresa_id]
    if zona_id:
        sql += " AND t.zona_id = %s"
        params.append(zona_id)
    sql += " ORDER BY z.orden, t.nombre"
    return db.fetch_all(sql, tuple(params))


def trabajadores_de_periodo(empresa_id: int, zona_id: int, anio: int,
                            mes: int | None = None) -> list[dict]:
    """Para precargar el formato con la gente de ESA zona el mes anterior."""
    sql = """
        SELECT DISTINCT t.codigo, t.nombre
        FROM plantacion.asis_trabajador t
        JOIN plantacion.asis_marcacion m ON m.trabajador_id = t.id
        JOIN plantacion.asis_periodo p   ON p.id = m.periodo_id
        WHERE p.empresa_id = %s AND p.zona_id = %s AND p.anio = %s
    """
    params: list = [empresa_id, zona_id, anio]
    if mes:
        sql += " AND p.mes = %s"
        params.append(mes)
    sql += " ORDER BY t.nombre"
    return db.fetch_all(sql, tuple(params))


# ============================================================
#  MARCACIONES
# ============================================================

_SQL_MARCACION = """
    INSERT INTO plantacion.asis_marcacion
        (periodo_id, trabajador_id, fecha, dia, entrada, salida,
         minutos, estado, n_marcas, marcas, departamento)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT (periodo_id, trabajador_id, dia) DO UPDATE SET
        fecha=EXCLUDED.fecha, entrada=EXCLUDED.entrada,
        salida=EXCLUDED.salida, minutos=EXCLUDED.minutos,
        estado=EXCLUDED.estado, n_marcas=EXCLUDED.n_marcas,
        marcas=EXCLUDED.marcas, departamento=EXCLUDED.departamento
"""


def guardar_marcacion(cur, periodo_id: int, trabajador_id: int, d: dict):
    cur.execute(_SQL_MARCACION, (
        periodo_id, trabajador_id, d["fecha"], d["dia"],
        d.get("entrada"), d.get("salida"), d.get("minutos"),
        d.get("estado", "completo"), d.get("n_marcas", 0),
        json.dumps(d.get("marcas") or []), d.get("departamento"),
    ))


_SELECT_MARCACIONES = """
    SELECT m.id, m.fecha, m.dia, m.entrada, m.salida, m.minutos,
           m.estado, m.n_marcas, m.departamento,
           t.id AS trabajador_id, t.codigo, t.nombre,
           p.anio, p.mes, p.formato, p.empresa_id, p.zona_id,
           e.nombre AS empresa, z.nombre AS zona
    FROM plantacion.asis_marcacion m
    JOIN plantacion.asis_periodo p    ON p.id = m.periodo_id
    JOIN plantacion.asis_trabajador t ON t.id = m.trabajador_id
    JOIN plantacion.fert_empresa e    ON e.id = p.empresa_id
    JOIN plantacion.asis_zona z       ON z.id = p.zona_id
"""


def listar_marcaciones(empresa_id: int | None = None, anio: int | None = None,
                       mes: int | None = None, dia: int | None = None,
                       trabajador: str | None = None,
                       zona_id: int | None = None) -> list[dict]:
    """
    Marcaciones filtradas. Todos los filtros son opcionales:
    sin ninguno devuelve todo el histórico de la empresa.
    """
    sql = _SELECT_MARCACIONES + " WHERE 1=1"
    params: list = []
    if empresa_id:
        sql += " AND p.empresa_id = %s"
        params.append(empresa_id)
    if zona_id:
        sql += " AND p.zona_id = %s"
        params.append(zona_id)
    if anio:
        sql += " AND p.anio = %s"
        params.append(anio)
    if mes:
        sql += " AND p.mes = %s"
        params.append(mes)
    if dia:
        sql += " AND m.dia = %s"
        params.append(dia)
    if trabajador and trabajador.strip():
        sql += " AND (t.nombre ILIKE %s OR t.codigo ILIKE %s)"
        patron = f"%{trabajador.strip()}%"
        params.extend([patron, patron])
    sql += " ORDER BY t.nombre, m.fecha"
    return db.fetch_all(sql, tuple(params))


def marcaciones_de_trabajador(trabajador_id: int, anio: int | None = None,
                              mes: int | None = None) -> list[dict]:
    sql = _SELECT_MARCACIONES + " WHERE t.id = %s"
    params: list = [trabajador_id]
    if anio:
        sql += " AND p.anio = %s"
        params.append(anio)
    if mes:
        sql += " AND p.mes = %s"
        params.append(mes)
    sql += " ORDER BY m.fecha"
    return db.fetch_all(sql, tuple(params))


def dias_con_registro(empresa_id: int, anio: int, mes: int,
                      zona_id: int | None = None) -> list[int]:
    """Días del mes que tienen alguna marcación, para el filtro de día."""
    sql = """
        SELECT DISTINCT m.dia FROM plantacion.asis_marcacion m
        JOIN plantacion.asis_periodo p ON p.id = m.periodo_id
        WHERE p.empresa_id = %s AND p.anio = %s AND p.mes = %s
    """
    params: list = [empresa_id, anio, mes]
    if zona_id:
        sql += " AND p.zona_id = %s"
        params.append(zona_id)
    sql += " ORDER BY m.dia"
    return [f["dia"] for f in db.fetch_all(sql, tuple(params))]
