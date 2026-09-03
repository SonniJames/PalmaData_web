"""
PalmaData · Recorridos · Repositorio
====================================
Lee los recorridos que arma recorridos_trabajador_generar() por cron.
La web nunca calcula: solo consulta la vista v_recorridos_trabajador.

Los recorridos se piden de a uno (trabajador + fecha): nunca se cargan
todas las líneas de golpe.
"""
from ...core import db


def fechas_disponibles(limite: int = 120) -> list[dict]:
    """Días con recorrido (fecha del evento)."""
    return db.fetch_all("""
        SELECT fecha, COUNT(*) AS recorridos, COUNT(DISTINCT trabajador) AS trabajadores
        FROM plantacion.recorridos_trabajador
        GROUP BY fecha ORDER BY fecha DESC LIMIT %s
    """, (limite,))


def fechas_actualizacion(limite: int = 60) -> list[dict]:
    """Días en que bajaron puntos del celular."""
    return db.fetch_all("""
        SELECT ultima_actualizacion::date AS fecha, COUNT(*) AS recorridos,
               COUNT(DISTINCT trabajador) AS trabajadores
        FROM plantacion.recorridos_trabajador
        WHERE ultima_actualizacion IS NOT NULL
        GROUP BY 1 ORDER BY 1 DESC LIMIT %s
    """, (limite,))


def trabajadores(fecha=None, actualiza=None) -> list[dict]:
    """
    Trabajadores con recorrido en la fecha elegida (por evento o por
    actualización). Sin la geometría: es para llenar el selector.
    """
    return db.fetch_all("""
        SELECT v.trabajador_codigo, v.trabajador,
               COUNT(*)            AS recorridos,
               SUM(v.puntos)       AS puntos,
               string_agg(DISTINCT v.labores, ' · ') AS labores
        FROM plantacion.v_recorridos_trabajador v
        WHERE (%s::date IS NULL OR v.fecha = %s::date)
          AND (%s::date IS NULL OR v.fecha_actualizacion = %s::date)
        GROUP BY v.trabajador_codigo, v.trabajador
        ORDER BY v.trabajador NULLS LAST
    """, (fecha, fecha, actualiza, actualiza))


def recorridos(trabajador: int, fecha=None, actualiza=None) -> list[dict]:
    """
    Los recorridos de UN trabajador en la fecha elegida, con geometría.
    Por fecha del evento es normalmente uno; por fecha de actualización
    pueden ser varios (varios días descargados el mismo día).
    """
    return db.fetch_all("""
        SELECT v.id, v.unico, v.fecha, v.trabajador_codigo, v.trabajador,
               v.puntos, v.horaini, v.horafin, v.distancia_m,
               v.formulario_ids, v.labores, v.fertilizante_ids, v.fertilizantes,
               v.ultima_actualizacion, v.fecha_actualizacion, v.generado_at,
               v.geojson
        FROM plantacion.v_recorridos_trabajador v
        WHERE v.trabajador_codigo = %s
          AND (%s::date IS NULL OR v.fecha = %s::date)
          AND (%s::date IS NULL OR v.fecha_actualizacion = %s::date)
        ORDER BY v.fecha
    """, (trabajador, fecha, fecha, actualiza, actualiza))


def lotes() -> list[dict]:
    """Los polígonos de los lotes activos, en lat/lon, para el fondo del mapa."""
    return db.fetch_all("""
        SELECT cat_lote_id, nombre, geojson
        FROM plantacion.v_lotes_mapa ORDER BY nombre
    """)
