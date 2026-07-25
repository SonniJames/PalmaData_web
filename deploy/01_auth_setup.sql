-- ============================================================
--  PalmaData · Preparación de autenticación
--  Ejecutar en pgAdmin sobre tu base (esquema donde viven los usuarios)
-- ============================================================

-- 1) Extensión para encriptar contraseñas (hash bcrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Nueva columna para las contraseñas de PalmaData
--    (ajusta el nombre del esquema/tabla si tu tabla de usuarios
--     no se llama exactamente 'plantacion.usuario')
ALTER TABLE plantacion.usuario
    ADD COLUMN IF NOT EXISTS password_palmadata TEXT;

-- ------------------------------------------------------------
-- 3) Crear/actualizar la contraseña de un usuario (provisional,
--    lo harás tú en pgAdmin mientras defines el módulo de usuarios)
--
--    gen_salt('bf') genera un salt bcrypt; crypt() hace el hash.
--    NUNCA se guarda la contraseña en texto plano.
-- ------------------------------------------------------------

-- Ejemplo: ponerle la contraseña 'MiClaveSegura123' al usuario 'nixon'
--   UPDATE plantacion.usuario
--   SET password_palmadata = crypt('MiClaveSegura123', gen_salt('bf'))
--   WHERE usuario = 'nixon';

-- ------------------------------------------------------------
-- 4) Cómo se verifica el login (esto lo hace el backend, aquí solo
--    de referencia): la contraseña es correcta si el hash coincide.
-- ------------------------------------------------------------

--   SELECT (password_palmadata = crypt('clave_ingresada', password_palmadata))
--          AS clave_correcta
--   FROM plantacion.usuario
--   WHERE usuario = 'nixon';

-- ------------------------------------------------------------
-- 5) Consulta útil: ver qué usuarios ya tienen contraseña PalmaData
-- ------------------------------------------------------------

--   SELECT usuario,
--          (password_palmadata IS NOT NULL) AS tiene_clave
--   FROM plantacion.usuario
--   ORDER BY usuario;
