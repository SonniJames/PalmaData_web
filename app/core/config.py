"""
PalmaData · Configuración
Lee variables de entorno desde .env
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")

# --- PostgreSQL ---
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "postgres")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

# --- Tabla de usuarios (reciclada de tu sistema anterior) ---
AUTH_SCHEMA = os.getenv("AUTH_SCHEMA", "plantacion")
AUTH_TABLE = os.getenv("AUTH_TABLE", "usuario")
AUTH_USER_COL = os.getenv("AUTH_USER_COL", "usuario")
AUTH_PASS_COL = os.getenv("AUTH_PASS_COL", "password_palmadata")
AUTH_NAME_COL = os.getenv("AUTH_NAME_COL", "nombre")

# --- Aplicación ---
APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "8000"))
SECRET_KEY = os.getenv("SECRET_KEY", "cambia-esta-clave")
SESSION_MINUTES = int(os.getenv("SESSION_MINUTES", "480"))

WEB_DIR = BASE_DIR / "web"
