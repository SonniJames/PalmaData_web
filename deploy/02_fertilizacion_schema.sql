-- ============================================================
--  PalmaData · Módulo FERTILIZACIÓN
--  Esquema: plantacion
--
--  ENFOQUE: el sistema almacena el Excel del ingeniero agrónomo
--  tal como él lo entrega (columnas A a ED). No recalcula nada
--  de lo que depende de su criterio. El backend solo consolida,
--  costea y visualiza.
--
--  Ejecutar en pgAdmin sobre palmadata_db.
-- ============================================================

SET search_path TO plantacion, public;

-- ------------------------------------------------------------
-- 1) CAMPAÑAS · un año por fila
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantacion.fert_campana (
    id          SERIAL PRIMARY KEY,
    anio        INTEGER     NOT NULL UNIQUE,
    nombre      TEXT,
    estado      SMALLINT    NOT NULL DEFAULT 1
                CONSTRAINT chk_fert_campana_estado CHECK (estado IN (0,1)),
    archivo     TEXT,           -- nombre del Excel que se cargó
    cargado_por TEXT,           -- usuario que hizo la carga
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_campana IS
    'Campañas de fertilización. Una por año. De aquí cuelga todo lo demás.';

-- ------------------------------------------------------------
-- 2) LOTE · identidad y datos base (columnas A–K)
--    Es la fila madre: todas las demás tablas apuntan aquí.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantacion.fert_lote (
    id              SERIAL  PRIMARY KEY,
    campana_id      INTEGER NOT NULL
                    REFERENCES plantacion.fert_campana(id) ON DELETE CASCADE,
    fila_excel      INTEGER,                -- de qué fila del archivo salió

    codigo          TEXT,                   -- A · código de laboratorio
    zona            TEXT,                   -- B
    rango_edad      TEXT,                   -- C · tal como lo escribe el agrónomo
    identificacion  TEXT    NOT NULL,       -- D · nombre del lote (llave)
    uma             INTEGER,                -- E
    material        TEXT,                   -- F
    siembra         INTEGER,                -- G
    palmas          INTEGER,                -- H
    hoja            INTEGER,                -- I
    mst             NUMERIC(16,6),          -- J
    tons            NUMERIC(16,6),          -- K

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_fert_lote UNIQUE (campana_id, identificacion)
);

CREATE INDEX IF NOT EXISTS idx_fert_lote_campana ON plantacion.fert_lote (campana_id);
CREATE INDEX IF NOT EXISTS idx_fert_lote_zona    ON plantacion.fert_lote (zona);
CREATE INDEX IF NOT EXISTS idx_fert_lote_uma     ON plantacion.fert_lote (uma);
CREATE INDEX IF NOT EXISTS idx_fert_lote_edad    ON plantacion.fert_lote (rango_edad);

COMMENT ON TABLE plantacion.fert_lote IS
    'Identidad del lote y datos base (columnas A-K del Excel). Fila madre del módulo.';

-- ============================================================
--  BLOQUES DE DATOS · uno por sección del Excel
--  Relación 1:1 con fert_lote (el lote_id es a la vez PK y FK)
-- ============================================================

-- Resultado del laboratorio (L-W)
CREATE TABLE IF NOT EXISTS plantacion.fert_foliar (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    n                    NUMERIC(16,6),
    p                    NUMERIC(16,6),
    k                    NUMERIC(16,6),
    ca                   NUMERIC(16,6),
    mg                   NUMERIC(16,6),
    cl                   NUMERIC(16,6),
    s                    NUMERIC(16,6),
    b                    NUMERIC(16,6),
    fe                   NUMERIC(16,6),
    cu                   NUMERIC(16,6),
    mn                   NUMERIC(16,6),
    zn                   NUMERIC(16,6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_foliar IS 'Resultado del laboratorio (L-W)';

-- Relaciones entre nutrientes (X-AJ)
CREATE TABLE IF NOT EXISTS plantacion.fert_secundarios (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    ca_mg_k              NUMERIC(16,6),
    sat_k                NUMERIC(16,6),
    sat_ca               NUMERIC(16,6),
    sat_mg               NUMERIC(16,6),
    ca_mg                NUMERIC(16,6),
    ca_k                 NUMERIC(16,6),
    mg_k                 NUMERIC(16,6),
    ca_mg_sobre_k        NUMERIC(16,6),
    n_k                  NUMERIC(16,6),
    n_p                  NUMERIC(16,6),
    k_p                  NUMERIC(16,6),
    ca_b                 NUMERIC(16,6),
    fe_mn                NUMERIC(16,6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_secundarios IS 'Relaciones entre nutrientes (X-AJ)';

-- Indice de balance, % sobre optimo (AK-AU)
CREATE TABLE IF NOT EXISTS plantacion.fert_indice (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    n                    NUMERIC(16,6),
    p                    NUMERIC(16,6),
    k                    NUMERIC(16,6),
    ca                   NUMERIC(16,6),
    mg                   NUMERIC(16,6),
    s                    NUMERIC(16,6),
    b                    NUMERIC(16,6),
    cu                   NUMERIC(16,6),
    fe                   NUMERIC(16,6),
    mn                   NUMERIC(16,6),
    zn                   NUMERIC(16,6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_indice IS 'Indice de balance, % sobre optimo (AK-AU)';

-- Diferencia con el nivel optimo (AV-BF)
CREATE TABLE IF NOT EXISTS plantacion.fert_diferencia (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    n                    NUMERIC(16,6),
    p                    NUMERIC(16,6),
    k                    NUMERIC(16,6),
    ca                   NUMERIC(16,6),
    mg                   NUMERIC(16,6),
    s                    NUMERIC(16,6),
    b                    NUMERIC(16,6),
    cu                   NUMERIC(16,6),
    fe                   NUMERIC(16,6),
    mn                   NUMERIC(16,6),
    zn                   NUMERIC(16,6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_diferencia IS 'Diferencia con el nivel optimo (AV-BF)';

-- Nivelacion + extraccion + total (BG-CD)
CREATE TABLE IF NOT EXISTS plantacion.fert_requerimiento (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    niv_n                NUMERIC(16,6),
    niv_p                NUMERIC(16,6),
    niv_k                NUMERIC(16,6),
    niv_ca               NUMERIC(16,6),
    niv_mg               NUMERIC(16,6),
    niv_s                NUMERIC(16,6),
    niv_b                NUMERIC(16,6),
    niv_zn               NUMERIC(16,6),
    ext_n                NUMERIC(16,6),
    ext_p                NUMERIC(16,6),
    ext_k                NUMERIC(16,6),
    ext_ca               NUMERIC(16,6),
    ext_mg               NUMERIC(16,6),
    ext_s                NUMERIC(16,6),
    ext_b                NUMERIC(16,6),
    ext_zn               NUMERIC(16,6),
    tot_n                NUMERIC(16,6),
    tot_p                NUMERIC(16,6),
    tot_k                NUMERIC(16,6),
    tot_ca               NUMERIC(16,6),
    tot_mg               NUMERIC(16,6),
    tot_s                NUMERIC(16,6),
    tot_b                NUMERIC(16,6),
    tot_zn               NUMERIC(16,6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_requerimiento IS 'Nivelacion + extraccion + total (BG-CD)';

-- Equivalente en oxido (CE-CK)
CREATE TABLE IF NOT EXISTS plantacion.fert_oxido (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    ox_n                 NUMERIC(16,6),
    ox_p2o5              NUMERIC(16,6),
    ox_k2o               NUMERIC(16,6),
    ox_cao               NUMERIC(16,6),
    ox_mgo               NUMERIC(16,6),
    ox_s                 NUMERIC(16,6),
    ox_b2o3              NUMERIC(16,6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_oxido IS 'Equivalente en oxido (CE-CK)';

-- Metodo 1: fertilizantes simples (CL-DG)
CREATE TABLE IF NOT EXISTS plantacion.fert_simples (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    dap_n                NUMERIC(16,6),
    dap_p2o5             NUMERIC(16,6),
    nca_n                NUMERIC(16,6),
    nca_ca               NUMERIC(16,6),
    kcl_k2o              NUMERIC(16,6),
    kieserita_mgo        NUMERIC(16,6),
    kieserita_s          NUMERIC(16,6),
    sulfdoble_mgo        NUMERIC(16,6),
    sulfdoble_k2o        NUMERIC(16,6),
    azufre_s             NUMERIC(16,6),
    borato_b             NUMERIC(16,6),
    zinc_zn              NUMERIC(16,6),
    znso4_dosis          NUMERIC(16,6),
    total_dosis          NUMERIC(16,6),
    kg_dap               NUMERIC(16,6),
    kg_nca               NUMERIC(16,6),
    kg_kcl               NUMERIC(16,6),
    kg_kieserita         NUMERIC(16,6),
    kg_sulf_kmg          NUMERIC(16,6),
    kg_azufre            NUMERIC(16,6),
    kg_borato            NUMERIC(16,6),
    kg_znso4             NUMERIC(16,6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_simples IS 'Metodo 1: fertilizantes simples (CL-DG)';

-- Metodo 2: grado compuesto y complementos (DH-DW)
CREATE TABLE IF NOT EXISTS plantacion.fert_grado (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    grado_dosis          NUMERIC(16,6),
    rem_n                NUMERIC(16,6),
    rem_p                NUMERIC(16,6),
    rem_k                NUMERIC(16,6),
    rem_mg               NUMERIC(16,6),
    rem_b                NUMERIC(16,6),
    nca_dosis            NUMERIC(16,6),
    nca_ca               NUMERIC(16,6),
    rafos_n              NUMERIC(16,6),
    rafos_dosis          NUMERIC(16,6),
    rafos_x              NUMERIC(16,6),
    pathenkali_dosis     NUMERIC(16,6),
    pathenkali_x         NUMERIC(16,6),
    kieserita_dosis      NUMERIC(16,6),
    boro_dosis           NUMERIC(16,6),
    total_dosis          NUMERIC(16,6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_grado IS 'Metodo 2: grado compuesto y complementos (DH-DW)';

-- Resultado final: toneladas por lote (DX-ED)
CREATE TABLE IF NOT EXISTS plantacion.fert_toneladas (
    lote_id     INTEGER PRIMARY KEY
                REFERENCES plantacion.fert_lote(id) ON DELETE CASCADE,
    t_grado              NUMERIC(16,6),
    t_nca                NUMERIC(16,6),
    t_rafos              NUMERIC(16,6),
    t_ksomgo             NUMERIC(16,6),
    t_kieserita          NUMERIC(16,6),
    t_borax              NUMERIC(16,6),
    t_znso4              NUMERIC(16,6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE plantacion.fert_toneladas IS 'Resultado final: toneladas por lote (DX-ED)';
-- ------------------------------------------------------------
-- 12) PARÁMETROS · lo único que se ingresa desde la web
--     Precios y ajustes. JSONB versionado por campaña.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plantacion.fert_parametros (
    id          SERIAL  PRIMARY KEY,
    campana_id  INTEGER NOT NULL UNIQUE
                REFERENCES plantacion.fert_campana(id) ON DELETE CASCADE,
    params      JSONB   NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fert_parametros_gin
    ON plantacion.fert_parametros USING GIN (params);
COMMENT ON TABLE plantacion.fert_parametros IS
    'Precios y ajustes ingresables desde la web, versionados por campaña.';

-- ------------------------------------------------------------
-- Trigger de updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION plantacion.fert_touch()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fert_lote_touch ON plantacion.fert_lote;
CREATE TRIGGER trg_fert_lote_touch BEFORE UPDATE ON plantacion.fert_lote
    FOR EACH ROW EXECUTE FUNCTION plantacion.fert_touch();

DROP TRIGGER IF EXISTS trg_fert_parametros_touch ON plantacion.fert_parametros;
CREATE TRIGGER trg_fert_parametros_touch BEFORE UPDATE ON plantacion.fert_parametros
    FOR EACH ROW EXECUTE FUNCTION plantacion.fert_touch();

-- ============================================================
--  VISTA · el lote completo en una sola consulta
--  Útil para revisar datos desde pgAdmin sin escribir los JOIN.
-- ============================================================
CREATE OR REPLACE VIEW plantacion.v_fert_completo AS
SELECT c.anio,
       l.id AS lote_id, l.codigo, l.zona, l.rango_edad, l.identificacion,
       l.uma, l.material, l.siembra, l.palmas, l.hoja, l.mst, l.tons,
       f.n AS foliar_n, f.p AS foliar_p, f.k AS foliar_k,
       f.ca AS foliar_ca, f.mg AS foliar_mg, f.s AS foliar_s,
       i.n AS indice_n, i.p AS indice_p, i.k AS indice_k,
       o.ox_n, o.ox_p2o5, o.ox_k2o, o.ox_mgo,
       t.t_grado, t.t_nca, t.t_rafos, t.t_ksomgo,
       t.t_kieserita, t.t_borax, t.t_znso4
FROM plantacion.fert_lote l
JOIN plantacion.fert_campana c ON c.id = l.campana_id
LEFT JOIN plantacion.fert_foliar     f ON f.lote_id = l.id
LEFT JOIN plantacion.fert_indice     i ON i.lote_id = l.id
LEFT JOIN plantacion.fert_oxido      o ON o.lote_id = l.id
LEFT JOIN plantacion.fert_toneladas  t ON t.lote_id = l.id;

-- ============================================================
--  Verificación
-- ============================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema='plantacion' AND table_name LIKE 'fert%' ORDER BY 1;

-- SELECT anio, COUNT(*) AS lotes FROM plantacion.v_fert_completo GROUP BY anio;
