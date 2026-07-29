-- ============================================================
--  PalmaData · Fertilización · Empresas
--  Ejecutar DESPUÉS de 05_fertilizacion_v2.sql
--
--  IDEA CENTRAL
--  La campaña pasa de ser "un año" a ser "una empresa en un año".
--  Como los lotes y los parámetros ya cuelgan de la campaña, la
--  separación por empresa se propaga sola: NO hay que agregar la
--  columna empresa a fert_lote ni a las tablas de bloques.
--
--        fert_empresa
--             ↓
--        fert_campana (empresa + año)
--             ├── fert_lote → fert_foliar / fert_balance / fert_requerimiento
--             └── fert_parametros
--
--  Consecuencias directas:
--   · Los parámetros y precios quedan por empresa, sin código extra.
--   · Cada empresa puede usar sus propios fertilizantes.
--   · Dos empresas pueden tener un lote con el mismo nombre sin chocar.
--   · Recargar el mismo año Y empresa reemplaza esos datos, no otros.
-- ============================================================

SET search_path TO plantacion, public;

-- ------------------------------------------------------------
-- 1) CATÁLOGO DE EMPRESAS
--    Lista fija: evita que la misma empresa entre escrita de
--    tres formas distintas y aparezca triplicada en los filtros.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantacion.fert_empresa (
    id          SERIAL  PRIMARY KEY,
    nombre      TEXT    NOT NULL UNIQUE,
    nit         TEXT,
    orden       INTEGER NOT NULL DEFAULT 100,
    activo      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_empresa IS
    'Empresas de la organización. La campaña es empresa + año.';

INSERT INTO plantacion.fert_empresa (nombre, orden) VALUES
    ('Palmeras de Yarima', 10),
    ('Villa Claudia',      20),
    ('CUCÚ',               30)
ON CONFLICT (nombre) DO NOTHING;

-- ------------------------------------------------------------
-- 2) LA CAMPAÑA AHORA ES EMPRESA + AÑO
-- ------------------------------------------------------------
ALTER TABLE plantacion.fert_campana
    ADD COLUMN IF NOT EXISTS empresa_id INTEGER;

-- Lo ya cargado pertenece a Palmeras de Yarima
UPDATE plantacion.fert_campana
SET empresa_id = (SELECT id FROM plantacion.fert_empresa
                  WHERE nombre = 'Palmeras de Yarima')
WHERE empresa_id IS NULL;

ALTER TABLE plantacion.fert_campana
    ALTER COLUMN empresa_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'fk_fert_campana_empresa') THEN
        ALTER TABLE plantacion.fert_campana
            ADD CONSTRAINT fk_fert_campana_empresa
            FOREIGN KEY (empresa_id) REFERENCES plantacion.fert_empresa(id);
    END IF;
END $$;

-- El año ya no es único por sí solo: lo es la pareja empresa + año
ALTER TABLE plantacion.fert_campana DROP CONSTRAINT IF EXISTS fert_campana_anio_key;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'uq_fert_campana_empresa_anio') THEN
        ALTER TABLE plantacion.fert_campana
            ADD CONSTRAINT uq_fert_campana_empresa_anio UNIQUE (empresa_id, anio);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fert_campana_empresa
    ON plantacion.fert_campana (empresa_id);

COMMENT ON COLUMN plantacion.fert_campana.empresa_id IS
    'Empresa dueña de la campaña. Con el año forma la llave única.';

-- ------------------------------------------------------------
-- 3) VISTA actualizada
-- ------------------------------------------------------------
DROP VIEW IF EXISTS plantacion.v_fert;
CREATE VIEW plantacion.v_fert AS
SELECT e.nombre AS empresa, c.anio,
       l.id AS lote_id, l.identificacion, l.uma, l.sector, l.zona,
       l.rango_edad, l.palmas, l.hectareas, l.mst, l.tons,
       f.datos AS foliar,
       b.datos AS balance,
       r.datos AS requerimiento
FROM plantacion.fert_lote l
JOIN plantacion.fert_campana c        ON c.id = l.campana_id
JOIN plantacion.fert_empresa e        ON e.id = c.empresa_id
LEFT JOIN plantacion.fert_foliar f    ON f.lote_id = l.id
LEFT JOIN plantacion.fert_balance b   ON b.lote_id = l.id
LEFT JOIN plantacion.fert_requerimiento r ON r.lote_id = l.id;

-- ============================================================
--  Verificación
-- ============================================================

-- Empresas registradas
-- SELECT id, nombre, orden, activo FROM plantacion.fert_empresa ORDER BY orden;

-- Campañas por empresa
-- SELECT e.nombre AS empresa, c.anio, COUNT(l.id) AS lotes
-- FROM plantacion.fert_campana c
-- JOIN plantacion.fert_empresa e ON e.id = c.empresa_id
-- LEFT JOIN plantacion.fert_lote l ON l.campana_id = c.id
-- GROUP BY e.nombre, c.anio, e.orden
-- ORDER BY e.orden, c.anio DESC;

-- Fertilizantes que usa cada empresa
-- SELECT e.nombre AS empresa, c.anio, kv.key AS fertilizante,
--        ROUND(SUM((kv.value)::numeric), 2) AS cantidad
-- FROM plantacion.fert_requerimiento r
-- JOIN plantacion.fert_lote l    ON l.id = r.lote_id
-- JOIN plantacion.fert_campana c ON c.id = l.campana_id
-- JOIN plantacion.fert_empresa e ON e.id = c.empresa_id,
--      LATERAL jsonb_each_text(r.datos) kv
-- GROUP BY e.nombre, c.anio, kv.key
-- ORDER BY e.nombre, c.anio DESC, cantidad DESC;

-- ------------------------------------------------------------
--  Agregar una empresa nueva en el futuro
-- ------------------------------------------------------------
-- INSERT INTO plantacion.fert_empresa (nombre, orden) VALUES ('Nombre', 40);
