import os
import duckdb

DATA_DIR = os.environ.get(
    "PARQUET_DATA_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
)


def open_connection() -> duckdb.DuckDBPyConnection:
    # Handlers must call .cursor() on app.state.db before executing — query state lives
    # on the connection, so sharing it across FastAPI's thread pool races and returns
    # empty/wrong results. One cursor per request (or per query) is isolation enough.
    return duckdb.connect(database=":memory:", read_only=False)


def parquet_path(table: str) -> str:
    return os.path.join(DATA_DIR, f"{table}.parquet")
