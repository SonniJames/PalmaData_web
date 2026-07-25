# PalmaData · Primera parte (login + shell)

## Paso A — Base de datos (en pgAdmin)

1. Ejecuta `deploy/01_auth_setup.sql`. Esto:
   - Instala la extensión `pgcrypto`.
   - Añade la columna `password_palmadata` a tu tabla de usuarios.

2. **Ajusta el nombre de la tabla** si tu tabla de usuarios no es `plantacion.usuario`.
   Para verlo:
   ```sql
   SELECT table_schema, table_name
   FROM information_schema.tables
   WHERE table_name ILIKE '%usuari%';
   ```

3. Crea una contraseña de prueba para un usuario real tuyo:
   ```sql
   UPDATE plantacion.usuario
   SET password_palmadata = crypt('claveDePrueba123', gen_salt('bf'))
   WHERE usuario = 'EL_USUARIO_QUE_QUIERAS';
   ```

## Paso B — Backend en el server

```bash
cd /home/datacenter
# copia aquí la carpeta palmadata_web
cd palmadata_web

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

cp .env.example .env
nano .env       # pon credenciales de Postgres + ajusta AUTH_TABLE/columnas + SECRET_KEY
```

### Verifica conexión y columnas
```bash
python -c "from app.core import db; print('DB', 'OK' if db.ping() else 'ERROR')"
```

### Arranca
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Paso C — Probar

- Abre `http://IP_DEL_SERVER:8000/login`
- Entra con el usuario y la `claveDePrueba123` que pusiste.
- Debe llevarte al shell con el menú lateral y la pantalla de bienvenida.
- Prueba "Salir": debe volver al login.

## Ajustes según tu tabla real

En `.env`:
- `AUTH_SCHEMA` / `AUTH_TABLE` — dónde viven los usuarios.
- `AUTH_USER_COL` — columna del nombre de usuario (lo que se escribe al entrar).
- `AUTH_PASS_COL` — columna del hash (déjala en `password_palmadata`).
- `AUTH_NAME_COL` — columna con el nombre a mostrar (si no existe, ponla igual a `AUTH_USER_COL`).

## Cómo se añade un módulo nuevo (para después)

Editas **un solo archivo**: `app/core/modules_registry.py`.
Cambias `activo` a `True` (o agregas un objeto nuevo). El menú se arma solo.

## Producción (cuando esté listo)

1. `deploy/palmadata_web.service` → `/etc/systemd/system/` y habilítalo.
2. Cloudflare Tunnel para exponerlo con HTTPS sin abrir puertos (lo montamos en su paso).
