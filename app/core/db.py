"""
PalmaData · Acceso a PostgreSQL
Pool de conexiones + helpers.
"""
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2 import pool

from . import config

_pool = pool.SimpleConnectionPool(
    1, 10,
    host=config.DB_HOST,
    port=config.DB_PORT,
    dbname=config.DB_NAME,
    user=config.DB_USER,
    password=config.DB_PASSWORD,
)


@contextmanager
def get_cursor():
    conn = _pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        yield cur
        conn.commit()
        cur.close()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def fetch_one(sql: str, params=None) -> dict | None:
    with get_cursor() as cur:
        cur.execute(sql, params or ())
        row = cur.fetchone()
        return dict(row) if row else None


def fetch_all(sql: str, params=None) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(sql, params or ())
        return [dict(r) for r in cur.fetchall()]


def ping() -> bool:
    try:
        return bool(fetch_one("SELECT 1 AS ok"))
    except Exception:
        return False
