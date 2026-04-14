import os
import duckdb

DATA_DIR = os.environ.get(
    "PARQUET_DATA_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
)


def open_connection() -> duckdb.DuckDBPyConnection:
    return duckdb.connect(database=":memory:", read_only=False)


def parquet_path(table: str) -> str:
    return os.path.join(DATA_DIR, f"{table}.parquet")
