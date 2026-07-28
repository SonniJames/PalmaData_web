-- ============================================================
--  PalmaData · Módulo FERTILIZACIÓN · Esquema v2
--  Esquema: plantacion
--
--  QUÉ CAMBIA RESPECTO A LA VERSIÓN ANTERIOR
--  De 12 tablas con 134 columnas fijas, a 6 tablas compactas.
--  Los bloques de datos se guardan en JSONB, así el sistema
--  soporta que cambien los fertilizantes, los nutrientes o los
--  campos entre campañas sin alterar ninguna tabla.
--
--  El Excel de carga pasa a tener una HOJA por concepto:
--    identificacion -> fert_lote
--    anal_foliar    -> fert_foliar
--    ind_balan      -> fert_balance
--    reque_fert     -> fert_requerimiento
--
--  Ejecutar en pgAdmin sobre palmadata_db.
-- ============================================================

SET search_path TO plantacion, public;

-- ------------------------------------------------------------
-- 0) LIMPIEZA · quita las tablas de la versión anterior
--    Si tenías datos cargados, se pierden: vuelve a subir el Excel.
-- ------------------------------------------------------------
DROP VIEW  IF EXISTS plantacion.v_fert_completo;
DROP TABLE IF EXISTS plantacion.fert_toneladas     CASCADE;
DROP TABLE IF EXISTS plantacion.fert_grado         CASCADE;
DROP TABLE IF EXISTS plantacion.fert_simples       CASCADE;
DROP TABLE IF EXISTS plantacion.fert_oxido         CASCADE;
DROP TABLE IF EXISTS plantacion.fert_requerimiento CASCADE;
DROP TABLE IF EXISTS plantacion.fert_diferencia    CASCADE;
DROP TABLE IF EXISTS plantacion.fert_indice        CASCADE;
DROP TABLE IF EXISTS plantacion.fert_secundarios   CASCADE;
DROP TABLE IF EXISTS plantacion.fert_foliar        CASCADE;
DROP TABLE IF EXISTS plantacion.fert_parametros    CASCADE;
DROP TABLE IF EXISTS plantacion.fert_lote          CASCADE;
DROP TABLE IF EXISTS plantacion.fert_campana       CASCADE;
-- Por si llegaste a crear las de los anexos:
DROP TABLE IF EXISTS plantacion.fert_precio        CASCADE;
DROP TABLE IF EXISTS plantacion.fert_plan          CASCADE;
DROP TABLE IF EXISTS plantacion.fert_producto      CASCADE;
DROP TABLE IF EXISTS plantacion.fert_unidad        CASCADE;

-- ============================================================
--  1) CAMPAÑAS · un año por fila
-- ============================================================
CREATE TABLE plantacion.fert_campana (
    id          SERIAL PRIMARY KEY,
    anio        INTEGER     NOT NULL UNIQUE,
    nombre      TEXT,
    estado      SMALLINT    NOT NULL DEFAULT 1
                CONSTRAINT chk_fert_campana_estado CHECK (estado IN (0,1)),
    archivo     TEXT,                 -- nombre del Excel cargado
    cargado_por TEXT,                 -- usuario que hizo la carga
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_campana IS
    'Campañas de fertilización. Una por año.';

-- ============================================================
--  2) LOTE · hoja "identificacion"
--     Todo lo que identifica y dimensiona la unidad.
-- ============================================================
CREATE TABLE plantacion.fert_lote (
    id              SERIAL  PRIMARY KEY,
    campana_id      INTEGER NOT NULL
                    REFERENCES plantacion.fert_campana(id) ON DELETE CASCADE,

    identificacion  TEXT    NOT NULL,   -- llave: enlaza todas las hojas
    uma             INTEGER,
    sector          TEXT,               -- finca (YARIMA, VIZCAINA, TENERIFE)
    zona            TEXT,
    rango_edad      TEXT,               -- tal como lo pone el agrónomo
    palmas          INTEGER,
    hectareas       NUMERIC(14,4),      -- opcional: habilita costo por hectárea
    material        TEXT,
    siembra         INTEGER,
    codigo          TEXT,               -- código de laboratorio
    hoja            INTEGER,            -- hoja muestreada
    mst             NUMERIC(16,6),
    tons            NUMERIC(16,6),      -- cosecha esperada

    extra           JSONB,              -- columnas adicionales de la hoja
    fila_excel      INTEGER,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_fert_lote UNIQUE (campana_id, identificacion)
);

CREATE INDEX idx_fert_lote_campana ON plantacion.fert_lote (campana_id);
CREATE INDEX idx_fert_lote_zona    ON plantacion.fert_lote (zona);
CREATE INDEX idx_fert_lote_sector  ON plantacion.fert_lote (sector);
CREATE INDEX idx_fert_lote_edad    ON plantacion.fert_lote (rango_edad);
CREATE INDEX idx_fert_lote_uma     ON plantacion.fert_lote (uma);

COMMENT ON TABLE plantacion.fert_lote IS
    'Identidad del lote (hoja identificacion). Fila madre del módulo.';
COMMENT ON COLUMN plantacion.fert_lote.extra IS
    'Columnas de la hoja que no corresponden a un campo conocido.';

-- ============================================================
--  3) ANÁLISIS FOLIAR · hoja "anal_foliar"
--     Resultado del laboratorio. JSONB: {"N":2.39,"P":0.144,...}
-- ============================================================
CREATE TABLE plantacion.fert_foliar (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    datos       JSONB   NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fert_foliar_gin ON plantacion.fert_foliar USING GIN (datos);
COMMENT ON TABLE plantacion.fert_foliar IS
    'Análisis foliar del laboratorio, por nutriente. JSONB para soportar cambios entre campañas.';

-- ============================================================
--  4) ÍNDICE DE BALANCE · hoja "ind_balan"
--     Porcentaje sobre el nivel óptimo. JSONB: {"N":99.5,...}
-- ============================================================
CREATE TABLE plantacion.fert_balance (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    datos       JSONB   NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fert_balance_gin ON plantacion.fert_balance USING GIN (datos);
COMMENT ON TABLE plantacion.fert_balance IS
    'Índice de balance nutricional (% sobre el óptimo).';

-- ============================================================
--  5) REQUERIMIENTO DE FERTILIZANTES · hoja "reque_fert"
--     Toneladas por producto. JSONB: {"Grado 13-5-27-5(Mg)":19.42,...}
--     Aquí está la clave de la flexibilidad: si el año que viene
--     se usan otros fertilizantes, entran solos.
-- ============================================================
CREATE TABLE plantacion.fert_requerimiento (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    datos       JSONB   NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fert_requerimiento_gin
    ON plantacion.fert_requerimiento USING GIN (datos);
COMMENT ON TABLE plantacion.fert_requerimiento IS
    'Fertilizantes requeridos por lote y su cantidad. JSONB: los productos pueden cambiar entre campañas.';

-- ============================================================
--  6) PARÁMETROS · precios, umbrales y hectáreas, por campaña
-- ============================================================
CREATE TABLE plantacion.fert_parametros (
    id          SERIAL  PRIMARY KEY,
    campana_id  INTEGER NOT NULL UNIQUE
                REFERENCES plantacion.fert_campana(id) ON DELETE CASCADE,
    params      JSONB   NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fert_parametros_gin
    ON plantacion.fert_parametros USING GIN (params);
COMMENT ON TABLE plantacion.fert_parametros IS
    'Precios por fertilizante, umbrales del semáforo y hectáreas. Versionado por campaña.';

-- ============================================================
--  Trigger de updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION plantacion.fert_touch()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fert_lote_touch BEFORE UPDATE ON plantacion.fert_lote
    FOR EACH ROW EXECUTE FUNCTION plantacion.fert_touch();

CREATE TRIGGER trg_fert_parametros_touch BEFORE UPDATE ON plantacion.fert_parametros
    FOR EACH ROW EXECUTE FUNCTION plantacion.fert_touch();

-- ============================================================
--  VISTA · el lote con sus tres bloques, para revisar en pgAdmin
-- ============================================================
CREATE OR REPLACE VIEW plantacion.v_fert AS
SELECT c.anio,
       l.id AS lote_id, l.identificacion, l.uma, l.sector, l.zona,
       l.rango_edad, l.palmas, l.hectareas, l.mst, l.tons,
       f.datos AS foliar,
       b.datos AS balance,
       r.datos AS requerimiento
FROM plantacion.fert_lote l
JOIN plantacion.fert_campana c        ON c.id = l.campana_id
LEFT JOIN plantacion.fert_foliar f    ON f.lote_id = l.id
LEFT JOIN plantacion.fert_balance b   ON b.lote_id = l.id
LEFT JOIN plantacion.fert_requerimiento r ON r.lote_id = l.id;

-- ============================================================
--  Consultas útiles
-- ============================================================

-- Tablas creadas
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema='plantacion' AND table_name LIKE 'fert%' ORDER BY 1;

-- Lotes por campaña
-- SELECT anio, COUNT(*) FROM plantacion.v_fert GROUP BY anio;

-- Qué fertilizantes se usaron en una campaña
-- SELECT DISTINCT jsonb_object_keys(r.datos) AS fertilizante
-- FROM plantacion.fert_requerimiento r
-- JOIN plantacion.fert_lote l ON l.id = r.lote_id
-- JOIN plantacion.fert_campana c ON c.id = l.campana_id
-- WHERE c.anio = 2026 ORDER BY 1;

-- Toneladas por fertilizante en una campaña
-- SELECT kv.key AS fertilizante,
--        ROUND(SUM((kv.value)::numeric), 2) AS toneladas
-- FROM plantacion.fert_requerimiento r
-- JOIN plantacion.fert_lote l ON l.id = r.lote_id
-- JOIN plantacion.fert_campana c ON c.id = l.campana_id,
--      LATERAL jsonb_each_text(r.datos) kv
-- WHERE c.anio = 2026
-- GROUP BY kv.key ORDER BY 2 DESC;
