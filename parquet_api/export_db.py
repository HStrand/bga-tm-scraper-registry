import json
import os
import pyodbc
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db_config.json")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

os.makedirs(OUTPUT_DIR, exist_ok=True)

with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    db = json.load(f)

conn = pyodbc.connect(
    f"Driver={{{db['driver']}}};"
    f"Server={db['server']};"
    f"Database={db['database']};"
    f"Uid={db['username']};"
    f"Pwd={db['password']};"
    f"Encrypt={db['encrypt']};"
    f"TrustServerCertificate={db['trust_server_certificate']};"
)

IGNORED_TABLES = {"GamePlayerTrackerChanges"}
CHUNK_SIZE = 50000


def sql_to_pa_type(sql_type: str) -> pa.DataType:
    t = sql_type.lower()
    if t == "bit":
        return pa.bool_()
    if t == "tinyint":
        return pa.int16()
    if t == "smallint":
        return pa.int16()
    if t == "int":
        return pa.int32()
    if t == "bigint":
        return pa.int64()
    if t in ("decimal", "numeric", "money", "smallmoney", "float"):
        return pa.float64()
    if t == "real":
        return pa.float32()
    if t in ("char", "varchar", "text", "nchar", "nvarchar", "ntext", "uniqueidentifier", "xml", "sysname"):
        return pa.string()
    if t == "date":
        return pa.date32()
    if t in ("datetime", "datetime2", "smalldatetime"):
        return pa.timestamp("us")
    if t == "datetimeoffset":
        return pa.timestamp("us", tz="UTC")
    if t == "time":
        return pa.time64("us")
    if t in ("binary", "varbinary", "image", "rowversion", "timestamp"):
        return pa.binary()
    return pa.string()


def build_schema(conn, schema_name: str, table_name: str) -> pa.Schema:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
        """,
        schema_name,
        table_name,
    )
    fields = [pa.field(name, sql_to_pa_type(dtype), nullable=True) for name, dtype in cur.fetchall()]
    cur.close()
    return pa.schema(fields)


tables_df = pd.read_sql(
    "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
    "WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME",
    conn,
)
tables_df = tables_df[~tables_df["TABLE_NAME"].isin(IGNORED_TABLES)]

print(f"Found {len(tables_df)} tables")

for _, row in tables_df.iterrows():
    schema_name = row["TABLE_SCHEMA"]
    table_name = row["TABLE_NAME"]
    filename = table_name.lower() + ".parquet"
    filepath = os.path.join(OUTPUT_DIR, filename)

    print(f"Exporting [{schema_name}].[{table_name}] -> {filename} ... ", end="", flush=True)

    pa_schema = build_schema(conn, schema_name, table_name)

    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM [{schema_name}].[{table_name}]")
    columns = [desc[0] for desc in cursor.description]

    tmp_path = filepath + ".tmp"
    total_rows = 0
    writer = pq.ParquetWriter(tmp_path, pa_schema, compression="snappy")
    try:
        while True:
            rows = cursor.fetchmany(CHUNK_SIZE)
            if not rows:
                break
            df = pd.DataFrame.from_records(rows, columns=columns)
            table_chunk = pa.Table.from_pandas(df, schema=pa_schema, preserve_index=False, safe=False)
            writer.write_table(table_chunk)
            total_rows += len(df)
    finally:
        writer.close()
        cursor.close()

    os.replace(tmp_path, filepath)
    print(f"{total_rows} rows")

conn.close()

# Produce a card-sorted copy of gamecards for fast per-card API queries.
# Kept separate from gamecards.parquet so the analyst bundle stays compact.
import duckdb
SORTED_TMP_DIR = "/mnt/duckdb-tmp"
os.makedirs(SORTED_TMP_DIR, exist_ok=True)
src = os.path.join(OUTPUT_DIR, "gamecards.parquet")
dst = os.path.join(OUTPUT_DIR, "gamecards_by_card.parquet")
tmp = dst + ".tmp"
print(f"Sorting {src} by Card -> {dst} ... ", end="", flush=True)
dk = duckdb.connect()
dk.execute("SET memory_limit='1500MB'")
dk.execute("SET threads=1")
dk.execute(f"SET temp_directory='{SORTED_TMP_DIR}'")
dk.execute(
    f"""
    COPY (SELECT * FROM read_parquet('{src}') ORDER BY Card, TableId)
    TO '{tmp}' (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 50000)
    """
)
dk.close()
os.replace(tmp, dst)
print(f"{os.path.getsize(dst) / 1024 / 1024:.1f} MB")

import zipfile

BUNDLE_PATH = os.path.join(OUTPUT_DIR, "tfmstats_db.zip")
bundle_tmp = BUNDLE_PATH + ".tmp"
print(f"Building bundle {BUNDLE_PATH} ... ", end="", flush=True)
BUNDLE_EXCLUDE = {"gamecards_by_card.parquet"}  # API-only sorted copy
with zipfile.ZipFile(bundle_tmp, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
    for entry in sorted(os.listdir(OUTPUT_DIR)):
        if entry.endswith(".parquet") and entry not in BUNDLE_EXCLUDE:
            zf.write(os.path.join(OUTPUT_DIR, entry), arcname=entry)
os.replace(bundle_tmp, BUNDLE_PATH)
print(f"{os.path.getsize(BUNDLE_PATH) / 1024 / 1024:.1f} MB")

print("Done!")
