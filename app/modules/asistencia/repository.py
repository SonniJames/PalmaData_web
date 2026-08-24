"""
PalmaData · Asistencia · Repositorio
====================================
Todo el SQL del módulo. El router no escribe consultas.

Tres tablas: asis_periodo, asis_trabajador, asis_marcacion.
Las empresas se reciclan de plantacion.fert_empresa.
"""
import json
import re

from ...core import db


# ============================================================
#  IDENTIDAD DEL TRABAJADOR
# ============================================================

def normalizar_codigo(codigo) -> str | None:
    """
    Normaliza el código del huellero.

    Los archivos a veces traen ceros delante o decimales sobrantes, y
    la nómina no: "0031", "31" y "31.0" son el mismo trabajador.
    Los códigos con letras se dejan tal cual.
    """
    if codigo is None:
        return None
    v = str(codigo).strip()
    if not v:
        return None
    if re.fullmatch(r"\d+\.0+", v):      # 31.0 -> 31
        v = v.split(".", 1)[0]
    if v.isdigit():                        # 0031 -> 31
        v = v.lstrip("0") or "0"
    return v


def modo_cruce(empresa_id: int) -> str:
    """
    Cómo se identifica a un trabajador en esa empresa.

    'codigo'         -> el código del huellero basta (Palmeras de Yarima)
    'codigo_nombre'  -> hace falta código + nombre porque los códigos
                        se repiten entre personas (Villa Claudia)
    """
    fila = db.fetch_one(
        "SELECT asis_cruce FROM plantacion.fert_empresa WHERE id = %s",
        (empresa_id,))
    return (fila or {}).get("asis_cruce") or "codigo_nombre"


def armar_id(modo: str, codigo, nombre) -> str | None:
    """Construye el id con el que se cruzan nómina y huellero."""
    cod = normalizar_codigo(codigo)
    if not cod:
        return None
    if modo == "codigo":
        return cod
    return f"{cod}_{nombre}" if nombre else cod


def normalizar_id_nomina(modo: str, valor, employee_id=None) -> str | None:
    """
    Normaliza el id que viene en el Excel de la nómina.

    Con modo 'codigo' se usa el código a secas. Con 'codigo_nombre' se
    respeta el nombre tal cual, pero se normaliza el prefijo numérico
    para que "0031_Juan" y "31_Juan" sean el mismo.
    """
    if modo == "codigo":
        return normalizar_codigo(valor or employee_id)

    v = (str(valor).strip() if valor is not None else "")
    if not v or v.lower() == "none":
        return None
    if "_" in v:
        prefijo, resto = v.split("_", 1)
        cod = normalizar_codigo(prefijo)
        return f"{cod}_{resto}" if cod else v
    return normalizar_codigo(v)



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


def registrar_en_periodo(cur, periodo_id: int, trabajador_id: int):
    """
    Deja constancia de que la persona venía en el archivo de ese
    período, marcara o no. Es el denominador del % de marcación.
    """
    cur.execute("""
        INSERT INTO plantacion.asis_periodo_trabajador (periodo_id, trabajador_id)
        VALUES (%s,%s) ON CONFLICT DO NOTHING
    """, (periodo_id, trabajador_id))


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
                               codigo: str, nombre: str,
                               modo: str = "codigo_nombre") -> int:
    """
    La llave es (empresa, id_compuesto), armado según el modo de la
    empresa: solo el código donde no se repite, código + nombre donde
    sí. El código se normaliza para que "0031" y "31" sean el mismo.
    """
    id_compuesto = armar_id(modo, codigo, nombre)
    cur.execute("""
        INSERT INTO plantacion.asis_trabajador
            (empresa_id, zona_id, codigo, nombre, id_compuesto)
        VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT (empresa_id, id_compuesto)
            DO UPDATE SET nombre = EXCLUDED.nombre,
                          zona_id = EXCLUDED.zona_id
        RETURNING id
    """, (empresa_id, zona_id, str(codigo), nombre, id_compuesto))
    return cur.fetchone()["id"]


def registrar_en_periodo(cur, periodo_id: int, trabajador_id: int):
    """
    Deja constancia de que la persona venía en el archivo de ese
    período, marcara o no. Es el denominador del % de marcación.
    """
    cur.execute("""
        INSERT INTO plantacion.asis_periodo_trabajador (periodo_id, trabajador_id)
        VALUES (%s,%s) ON CONFLICT DO NOTHING
    """, (periodo_id, trabajador_id))


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
    La llave es (empresa, id_compuesto), donde id_compuesto es
    "EmployeeID_Nombre". El Employee ID solo no basta: se repite entre
    personas distintas, y fusionarlas mezclaría sus marcaciones.

    `zona_id` se guarda como referencia de la última zona donde se la
    vio, pero no forma parte de la llave: la misma persona puede marcar
    en varios huelleros.
    """
    id_compuesto = f"{codigo}_{nombre}"
    cur.execute("""
        INSERT INTO plantacion.asis_trabajador
            (empresa_id, zona_id, codigo, nombre, id_compuesto)
        VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT (empresa_id, id_compuesto)
            DO UPDATE SET nombre = EXCLUDED.nombre,
                          zona_id = EXCLUDED.zona_id
        RETURNING id
    """, (empresa_id, zona_id, str(codigo), nombre, id_compuesto))
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
                       zona_id: int | None = None,
                       departamento: str | None = None) -> list[dict]:
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
    if departamento and departamento.strip():
        if departamento.strip().lower() in ("sin asignar", "(sin asignar)"):
            sql += " AND (m.departamento IS NULL OR m.departamento = '')"
        else:
            sql += " AND m.departamento = %s"
            params.append(departamento.strip())
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


def departamentos_disponibles(empresa_id: int, zona_id=None,
                              anio=None, mes=None) -> list[str]:
    """Supervisores con marcaciones, para el desplegable del filtro."""
    sql = """
        SELECT DISTINCT m.departamento AS v
        FROM plantacion.asis_marcacion m
        JOIN plantacion.asis_periodo p ON p.id = m.periodo_id
        WHERE p.empresa_id = %s
          AND m.departamento IS NOT NULL AND m.departamento <> ''
    """
    params: list = [empresa_id]
    if zona_id:
        sql += " AND p.zona_id = %s"
        params.append(zona_id)
    if anio:
        sql += " AND p.anio = %s"
        params.append(anio)
    if mes:
        sql += " AND p.mes = %s"
        params.append(mes)
    sql += " ORDER BY v"
    return [f["v"] for f in db.fetch_all(sql, tuple(params))]


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


# ============================================================
#  NÓMINA DE TRABAJADORES ACTIVOS
#  Una sola tabla para todas las empresas. Cada carga la reemplaza.
# ============================================================

def hay_nomina(empresa_id: int | None = None) -> int:
    sql = "SELECT COUNT(*) AS n FROM plantacion.asis_trabajador_activo"
    params: tuple = ()
    if empresa_id:
        sql += " WHERE empresa_id = %s"
        params = (empresa_id,)
    return (db.fetch_one(sql, params) or {}).get("n", 0)


def reemplazar_nomina(cur, registros: list[dict],
                      archivo=None, usuario=None) -> dict:
    """Borra TODA la nómina y carga la nueva. La empresa viene en el archivo."""
    cur.execute("DELETE FROM plantacion.asis_trabajador_activo")
    borrados = cur.rowcount

    modos: dict = {}
    insertados = 0
    sin_id = 0

    for r in registros:
        eid = r["empresa_id"]
        if eid not in modos:
            modos[eid] = modo_cruce(eid)
        idc = normalizar_id_nomina(modos[eid], r.get("id_compuesto"),
                                   r.get("employee_id"))
        if not idc:
            sin_id += 1

        cur.execute("""
            INSERT INTO plantacion.asis_trabajador_activo
                (empresa_id, codigo, nombre, employee_id, id_compuesto,
                 supervisor, estado, fila_excel, archivo, cargado_por)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (empresa_id, id_compuesto) DO NOTHING
        """, (eid, r["codigo"], r["nombre"], r.get("employee_id"),
              idc, r.get("supervisor"), r.get("estado", 1),
              r.get("fila_excel"), archivo, usuario))
        insertados += 1

    return {"borrados": borrados, "insertados": insertados,
            "sin_id": sin_id, "modos": modos}


def resumen_nomina() -> list[dict]:
    return db.fetch_all("""
        SELECT a.empresa_id, e.nombre AS empresa,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE a.id_compuesto IS NOT NULL) AS con_id,
               COUNT(*) FILTER (WHERE a.supervisor IS NOT NULL) AS con_supervisor,
               MAX(a.cargado_at) AS ultima_carga, MAX(a.archivo) AS archivo
        FROM plantacion.asis_trabajador_activo a
        JOIN plantacion.fert_empresa e ON e.id = a.empresa_id
        GROUP BY a.empresa_id, e.nombre, e.orden ORDER BY e.orden
    """)


def cruzar_periodo(cur, periodo_id: int) -> dict:
    """Congela el cruce contra la nómina para ese período."""
    cur.execute("SELECT * FROM plantacion.asis_cruzar_periodo(%s)", (periodo_id,))
    fila = cur.fetchone() or {}
    return {"activos": fila.get("activos", 0),
            "inactivos": fila.get("inactivos", 0)}


def sin_cruzar(empresa_id: int, limite: int = 300) -> list[dict]:
    """
    Gente del huellero cuyo id compuesto no está en la nómina.
    Sirve para corregir la columna `id` del Excel de trabajadores.
    """
    return db.fetch_all("""
        SELECT DISTINCT t.codigo, t.nombre, t.id_compuesto,
               COUNT(m.id) AS marcaciones
        FROM plantacion.asis_marcacion m
        JOIN plantacion.asis_trabajador t ON t.id = m.trabajador_id
        WHERE t.empresa_id = %s AND m.estado_activo = 0
        GROUP BY t.codigo, t.nombre, t.id_compuesto
        ORDER BY COUNT(m.id) DESC, t.nombre
        LIMIT %s
    """, (empresa_id, limite))


def supervisores_disponibles(empresa_id: int) -> list[str]:
    filas = db.fetch_all("""
        SELECT DISTINCT supervisor AS v
        FROM plantacion.asis_trabajador_activo
        WHERE empresa_id = %s AND supervisor IS NOT NULL AND supervisor <> ''
        ORDER BY v
    """, (empresa_id,))
    return [f["v"] for f in filas]


# ============================================================
#  CONSULTAS DEL ANÁLISIS · sobre la vista v_asistencia
# ============================================================

_FILTROS = """
    WHERE v.empresa_id = %s
"""


def _armar_filtros(empresa_id: int, anio=None, mes=None, dia=None,
                   trabajador=None, supervisor=None) -> tuple[str, list]:
    sql = " WHERE v.empresa_id = %s"
    params: list = [empresa_id]
    if anio:
        sql += " AND v.anio = %s"
        params.append(anio)
    if mes:
        sql += " AND v.mes = %s"
        params.append(mes)
    if dia:
        sql += " AND v.dia = %s"
        params.append(dia)
    if trabajador and str(trabajador).strip():
        sql += " AND (v.nombre ILIKE %s OR v.codigo ILIKE %s)"
        patron = f"%{str(trabajador).strip()}%"
        params.extend([patron, patron])
    if supervisor and str(supervisor).strip():
        if str(supervisor).strip().lower() in ("sin asignar", "(sin asignar)"):
            sql += " AND (v.supervisor IS NULL OR v.supervisor = '')"
        else:
            sql += " AND v.supervisor = %s"
            params.append(str(supervisor).strip())
    return sql, params


def marcaciones_vista(empresa_id: int, anio=None, mes=None, dia=None,
                      trabajador=None, supervisor=None,
                      solo_completos: bool = False) -> list[dict]:
    """
    Marcaciones de trabajadores activos, UNA por persona y fecha.

    Una persona aparece en el archivo de varios huelleros y puede marcar
    en más de uno el mismo día. Sin deduplicar, ese día se contaría
    varias veces. Se conserva la mejor: primero la que tiene jornada
    calculable, luego la de mayor duración.
    """
    filtro, params = _armar_filtros(empresa_id, anio, mes, dia,
                                    trabajador, supervisor)
    sql = """
        SELECT DISTINCT ON (v.trabajador_id, v.fecha)
               v.marcacion_id, v.codigo, v.nombre, v.supervisor,
               v.trabajador_id, v.cod_huellero, v.id_compuesto,
               v.fecha, v.dia, v.anio, v.mes,
               v.entrada, v.salida, v.minutos, v.horas,
               v.estado_marcacion AS estado, v.n_marcas, v.zona
        FROM plantacion.v_asistencia v
    """ + filtro
    if solo_completos:
        sql += " AND v.estado_marcacion = 'completo'"
    sql += """
        ORDER BY v.trabajador_id, v.fecha,
                 (v.estado_marcacion = 'completo') DESC,
                 v.minutos DESC NULLS LAST, v.marcacion_id
    """
    filas = db.fetch_all(sql, tuple(params))
    filas.sort(key=lambda f: ((f.get("nombre") or "").lower(), str(f.get("fecha"))))
    return filas


def padron_activo(empresa_id: int, anio=None, mes=None,
                  supervisor=None) -> list[dict]:
    """
    Los trabajadores que DEBÍAN marcar: toda la nómina activa de la
    empresa.

    Es el denominador del porcentaje de marcación y la base de las
    ausencias. Sale directo de asis_trabajador_activo, no de quiénes
    aparecieron en los archivos: alguien que no salga en ningún reporte
    del huellero igual debía marcar, y su ausencia es justamente lo que
    hay que ver.
    """
    sql = """
        SELECT a.id AS activo_id, a.codigo, a.nombre, a.supervisor,
               a.id_compuesto, a.employee_id,
               t.id AS trabajador_id
        FROM plantacion.asis_trabajador_activo a
        LEFT JOIN plantacion.asis_trabajador t
               ON t.empresa_id = a.empresa_id
              AND t.id_compuesto = a.id_compuesto
        WHERE a.empresa_id = %s AND a.estado = 1
    """
    params: list = [empresa_id]
    if supervisor and str(supervisor).strip():
        if str(supervisor).strip().lower() in ("sin asignar", "(sin asignar)"):
            sql += " AND (a.supervisor IS NULL OR a.supervisor = '')"
        else:
            sql += " AND a.supervisor = %s"
            params.append(str(supervisor).strip())
    sql += " ORDER BY a.nombre"

    filas = db.fetch_all(sql, tuple(params))
    # Los que nunca aparecieron en un huellero no tienen trabajador_id.
    # Se les da uno negativo y estable para poder contarlos aparte.
    for i, f in enumerate(filas, 1):
        if f.get("trabajador_id") is None:
            f["trabajador_id"] = -i
            f["nunca_en_huellero"] = True
        else:
            f["nunca_en_huellero"] = False
    return filas


def dias_con_actividad(empresa_id: int, anio=None, mes=None,
                       dia=None) -> list[str]:
    """Fechas en las que hubo alguna marcación. Base del denominador."""
    sql = """
        SELECT DISTINCT v.fecha FROM plantacion.v_asistencia v
        WHERE v.empresa_id = %s
    """
    params: list = [empresa_id]
    if anio:
        sql += " AND v.anio = %s"
        params.append(anio)
    if mes:
        sql += " AND v.mes = %s"
        params.append(mes)
    if dia:
        sql += " AND v.dia = %s"
        params.append(dia)
    sql += " ORDER BY v.fecha"
    return [str(f["fecha"]) for f in db.fetch_all(sql, tuple(params))]


def anios_vista(empresa_id: int) -> list[int]:
    filas = db.fetch_all("""
        SELECT DISTINCT anio FROM plantacion.v_asistencia
        WHERE empresa_id = %s ORDER BY anio DESC
    """, (empresa_id,))
    return [f["anio"] for f in filas]


def meses_vista(empresa_id: int, anio: int) -> list[int]:
    filas = db.fetch_all("""
        SELECT DISTINCT mes FROM plantacion.v_asistencia
        WHERE empresa_id = %s AND anio = %s ORDER BY mes
    """, (empresa_id, anio))
    return [f["mes"] for f in filas]


def dias_vista(empresa_id: int, anio: int, mes: int) -> list[int]:
    filas = db.fetch_all("""
        SELECT DISTINCT dia FROM plantacion.v_asistencia
        WHERE empresa_id = %s AND anio = %s AND mes = %s ORDER BY dia
    """, (empresa_id, anio, mes))
    return [f["dia"] for f in filas]
