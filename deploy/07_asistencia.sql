-- ============================================================
--  PalmaData · Módulo ASISTENCIA
--  Esquema: plantacion
--
--  Los reportes del huellero son MENSUALES (a diferencia de
--  fertilización, que es anual). El período es empresa + año + mes.
--
--  Reutiliza plantacion.fert_empresa como catálogo de empresas.
--
--  Ejecutar en pgAdmin sobre palmadata_db.
-- ============================================================

SET search_path TO plantacion, public;

-- ------------------------------------------------------------
-- 1) PERÍODO · una empresa en un mes concreto
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantacion.asis_periodo (
    id          SERIAL  PRIMARY KEY,
    empresa_id  INTEGER NOT NULL
                REFERENCES plantacion.fert_empresa(id),
    anio        INTEGER NOT NULL CHECK (anio BETWEEN 1990 AND 2100),
    mes         SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
    dias        SMALLINT,              -- días que tuvo ese mes
    archivo     TEXT,
    cargado_por TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_asis_periodo UNIQUE (empresa_id, anio, mes)
);
CREATE INDEX IF NOT EXISTS idx_asis_periodo_empresa
    ON plantacion.asis_periodo (empresa_id, anio, mes);

COMMENT ON TABLE plantacion.asis_periodo IS
    'Reporte de asistencia de una empresa en un mes. Recargar reemplaza sus datos.';

-- ------------------------------------------------------------
-- 2) TRABAJADOR · catálogo por empresa
--    El código viene del huellero (Employee ID) y se mantiene
--    entre meses, así el histórico de una persona queda unido.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantacion.asis_trabajador (
    id          SERIAL  PRIMARY KEY,
    empresa_id  INTEGER NOT NULL
                REFERENCES plantacion.fert_empresa(id),
    codigo      TEXT    NOT NULL,      -- Employee ID del huellero
    nombre      TEXT    NOT NULL,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_asis_trabajador UNIQUE (empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_asis_trabajador_empresa
    ON plantacion.asis_trabajador (empresa_id);
CREATE INDEX IF NOT EXISTS idx_asis_trabajador_nombre
    ON plantacion.asis_trabajador (nombre);

COMMENT ON TABLE plantacion.asis_trabajador IS
    'Personas registradas en el huellero, por empresa.';

-- ------------------------------------------------------------
-- 3) MARCACIÓN · un día de un trabajador
--
--    entrada / salida salen de la primera y la última marca del día.
--    `marcas` guarda TODAS las marcas originales por si hay que
--    auditar (el huellero repite la misma hora varias veces).
--
--    estado:
--      completo    -> entrada y salida distintas: jornada calculable
--      incompleta  -> una sola marca (o todas iguales): falta una
--      sin_registro-> el día no tiene marcas (no se guarda fila)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantacion.asis_marcacion (
    id             SERIAL PRIMARY KEY,
    periodo_id     INTEGER NOT NULL
                   REFERENCES plantacion.asis_periodo(id) ON DELETE CASCADE,
    trabajador_id  INTEGER NOT NULL
                   REFERENCES plantacion.asis_trabajador(id) ON DELETE CASCADE,

    fecha          DATE    NOT NULL,
    dia            SMALLINT NOT NULL,
    entrada        TIME,
    salida         TIME,
    minutos        INTEGER,            -- duración de la jornada
    estado         TEXT    NOT NULL DEFAULT 'completo',
    n_marcas       SMALLINT NOT NULL DEFAULT 0,
    marcas         JSONB,              -- todas las marcas del día

    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_asis_marcacion UNIQUE (periodo_id, trabajador_id, dia),
    CONSTRAINT chk_asis_estado CHECK (estado IN ('completo', 'incompleta'))
);
CREATE INDEX IF NOT EXISTS idx_asis_marcacion_periodo
    ON plantacion.asis_marcacion (periodo_id);
CREATE INDEX IF NOT EXISTS idx_asis_marcacion_trab
    ON plantacion.asis_marcacion (trabajador_id);
CREATE INDEX IF NOT EXISTS idx_asis_marcacion_fecha
    ON plantacion.asis_marcacion (fecha);
CREATE INDEX IF NOT EXISTS idx_asis_marcacion_estado
    ON plantacion.asis_marcacion (estado);

COMMENT ON TABLE plantacion.asis_marcacion IS
    'Un día de un trabajador: entrada, salida y duración. Los días sin marcas no se guardan.';
COMMENT ON COLUMN plantacion.asis_marcacion.estado IS
    'completo = entrada y salida distintas; incompleta = falta una de las dos.';

-- ------------------------------------------------------------
-- 4) Trigger de updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION plantacion.asis_touch()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asis_trabajador_touch ON plantacion.asis_trabajador;
CREATE TRIGGER trg_asis_trabajador_touch
    BEFORE UPDATE ON plantacion.asis_trabajador
    FOR EACH ROW EXECUTE FUNCTION plantacion.asis_touch();

-- ============================================================
--  VISTA · marcaciones con nombre y empresa
-- ============================================================
CREATE OR REPLACE VIEW plantacion.v_asistencia AS
SELECT e.nombre AS empresa, p.anio, p.mes,
       t.codigo, t.nombre AS trabajador,
       m.fecha, m.dia, m.entrada, m.salida, m.minutos,
       ROUND(m.minutos / 60.0, 2) AS horas,
       m.estado, m.n_marcas
FROM plantacion.asis_marcacion m
JOIN plantacion.asis_periodo p    ON p.id = m.periodo_id
JOIN plantacion.asis_trabajador t ON t.id = m.trabajador_id
JOIN plantacion.fert_empresa e    ON e.id = p.empresa_id;

-- ============================================================
--  Consultas útiles
-- ============================================================

-- Períodos cargados
-- SELECT e.nombre, p.anio, p.mes, COUNT(m.id) AS marcaciones
-- FROM plantacion.asis_periodo p
-- JOIN plantacion.fert_empresa e ON e.id = p.empresa_id
-- LEFT JOIN plantacion.asis_marcacion m ON m.periodo_id = p.id
-- GROUP BY e.nombre, p.anio, p.mes ORDER BY p.anio DESC, p.mes DESC;

-- Promedio de entrada y salida de cada trabajador en un mes
-- SELECT trabajador,
--        TO_CHAR(AVG(entrada::interval), 'HH24:MI') AS entrada_prom,
--        TO_CHAR(AVG(salida::interval), 'HH24:MI')  AS salida_prom,
--        ROUND(AVG(horas), 2) AS horas_prom,
--        COUNT(*) AS dias
-- FROM plantacion.v_asistencia
-- WHERE anio = 2026 AND mes = 8 AND estado = 'completo'
-- GROUP BY trabajador ORDER BY horas_prom DESC;

-- Días con marcación incompleta
-- SELECT trabajador, fecha, n_marcas FROM plantacion.v_asistencia
-- WHERE estado = 'incompleta' ORDER BY fecha;
