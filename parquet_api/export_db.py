import json
import pyodbc
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import os

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

# GameCards is excluded from the spike: ~38M rows / 150MB parquet, and
# buffering the full table to unify chunk schemas would risk OOM on the 4GB VM.
# It isn't needed by the /api/corporations/playerstats endpoint.
IGNORED_TABLES = {"GamePlayerTrackerChanges", "GameCards"}

tables_df = pd.read_sql(
    "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
    "WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME",
    conn,
)
tables_df = tables_df[~tables_df["TABLE_NAME"].isin(IGNORED_TABLES)]

print(f"Found {len(tables_df)} tables")

for _, row in tables_df.iterrows():
    schema = row["TABLE_SCHEMA"]
    table = row["TABLE_NAME"]
    filename = table.lower() + ".parquet"
    filepath = os.path.join(OUTPUT_DIR, filename)

    print(f"Exporting [{schema}].[{table}] -> {filename} ... ", end="", flush=True)
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM [{schema}].[{table}]")
    columns = [desc[0] for desc in cursor.description]
    total_rows = 0
    batches = []
    try:
        while True:
            rows = cursor.fetchmany(50000)
            if not rows:
                break
            df = pd.DataFrame.from_records(rows, columns=columns)
            batches.append(pa.Table.from_pandas(df, preserve_index=False))
            total_rows += len(df)
    finally:
        cursor.close()

    if batches:
        combined = pa.concat_tables(batches, promote_options="default")
        pq.write_table(combined, filepath, compression="snappy")
    else:
        pq.write_table(
            pa.Table.from_pandas(pd.DataFrame(columns=columns), preserve_index=False),
            filepath,
        )
    print(f"{total_rows} rows")

conn.close()
print("Done!")
