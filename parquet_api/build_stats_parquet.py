"""Fold new stats documents into the stats parquet files.

The Registry API writes one JSON document per uploaded game log to the "stats" blob
container ({yyyy-MM-dd}/{TableId}_{PlayerPerspective}.json, see Services/StatsDocument.cs).
This job downloads the documents written since the last run and replaces their rows in the
eleven stats parquet files, with the same keys the SQL path used:

  by TableId:            gamestats, gamemilestones, gameplayerawards, parameterchanges,
                         gamecitylocations, gamegreenerylocations
  by (TableId, PlayerId): gameplayerstats, startinghandcorporations, startinghandpreludes,
                         startinghandcards, gamecards

Parquet files cannot be updated in place: a table that received rows is rewritten from the
previous file (anti-join on the keys) plus the new rows, to a .tmp file swapped in with
os.replace, so the API never reads a half-written file. Tables with no new rows are untouched.

Usage (on the VM, from /opt/tfmstats-api):
  venv/bin/python build_stats_parquet.py --bootstrap --out-dir data_shadow   # once: copy data/ -> data_shadow/
  venv/bin/python build_stats_parquet.py --out-dir data_shadow --bootstrap-if-missing --until-export-start   # nightly, shadow
  venv/bin/python build_stats_parquet.py --by-card                           # nightly, live (writes data/)
  venv/bin/python build_stats_parquet.py --docs-dir ./docs --out-dir /tmp/x  # local test, no blob access

Export start: the SQL export on the VM runs under run_with_record.sh, which writes
~/logs/runs/db-export_<ts>.json with a started_at. --bootstrap sets the watermark to the latest
export's start (falling back to the oldest stats file's mtime minus 30 minutes), and
--until-export-start applies only documents written up to that start, so a night's blob-sourced
files cover exactly what that night's SQL export covers and the comparison is clean.

Blob access: blob_config.json next to this file, either {"connection_string": "..."} or
{"account_url": "https://<account>.blob.core.windows.net", "sas_token": "..."} (read + list
on the stats container is enough). The file is secret and gitignored.
"""
import argparse
import datetime as dt
import glob
import json
import os
import shutil
import sys
import time

import pyarrow as pa
import pyarrow.parquet as pq

HERE = os.path.dirname(os.path.abspath(__file__))
CONTAINER = "stats"
WATERMARK_FILE = "stats_watermark.json"

KEYS = {
    "gamestats": ("TableId",),
    "gamemilestones": ("TableId",),
    "gameplayerawards": ("TableId",),
    "parameterchanges": ("TableId",),
    "gamecitylocations": ("TableId",),
    "gamegreenerylocations": ("TableId",),
    "gameplayerstats": ("TableId", "PlayerId"),
    "startinghandcorporations": ("TableId", "PlayerId"),
    "startinghandpreludes": ("TableId", "PlayerId"),
    "startinghandcards": ("TableId", "PlayerId"),
    "gamecards": ("TableId", "PlayerId"),
}
TABLES = list(KEYS)


def log(msg):
    print(f"{dt.datetime.now(dt.timezone.utc):%Y-%m-%dT%H:%M:%S}  {msg}", flush=True)


def parse_utc(value):
    """ISO-8601 string -> naive UTC datetime (the parquet UpdatedAt columns are naive UTC)."""
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        d = value
    else:
        d = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if d.tzinfo is not None:
        d = d.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return d


# ---------------------------------------------------------------- watermark

def read_watermark(out_dir):
    path = os.path.join(out_dir, WATERMARK_FILE)
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return parse_utc(json.load(f)["last_modified_utc"])


def write_watermark(out_dir, last_modified, docs_applied):
    path = os.path.join(out_dir, WATERMARK_FILE)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({
            "last_modified_utc": last_modified.replace(microsecond=0).isoformat() + "Z",
            "run_at_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0, tzinfo=None).isoformat() + "Z",
            "docs_applied": docs_applied,
        }, f, indent=2)
    os.replace(tmp, path)


def latest_export_start(records_glob):
    """started_at of the newest db-export run record, or None."""
    records = sorted(glob.glob(os.path.expanduser(records_glob)))
    if not records:
        return None
    with open(records[-1], encoding="utf-8") as f:
        return parse_utc(json.load(f)["started_at"])


# ---------------------------------------------------------------- documents

def load_blob_config():
    path = os.path.join(HERE, "blob_config.json")
    if not os.path.exists(path):
        sys.exit(f"{path} is missing; see the module docstring")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def container_client():
    from azure.storage.blob import ContainerClient  # only needed for blob mode

    cfg = load_blob_config()
    if cfg.get("connection_string"):
        return ContainerClient.from_connection_string(cfg["connection_string"], CONTAINER)
    return ContainerClient(account_url=cfg["account_url"], container_name=CONTAINER, credential=cfg["sas_token"])


def fetch_new_docs(since, incoming_dir):
    """Download every document modified after `since` into incoming_dir. Returns [(last_modified, path)]."""
    client = container_client()
    os.makedirs(incoming_dir, exist_ok=True)
    found = []
    day = since.date()
    today = dt.datetime.now(dt.timezone.utc).date()
    while day <= today:
        for blob in client.list_blobs(name_starts_with=f"{day:%Y-%m-%d}/"):
            modified = parse_utc(blob.last_modified)
            if modified <= since:
                continue
            local = os.path.join(incoming_dir, blob.name.replace("/", "__"))
            with open(local, "wb") as f:
                f.write(client.download_blob(blob.name).readall())
            found.append((modified, local))
        day += dt.timedelta(days=1)
    return found


def local_docs(docs_dir):
    files = sorted(glob.glob(os.path.join(docs_dir, "**", "*.json"), recursive=True))
    return [(dt.datetime.fromtimestamp(os.path.getmtime(p), dt.timezone.utc).replace(tzinfo=None), p) for p in files]


def collect_rows(docs):
    """Latest document wins per (table, key). Returns {table: {key: [rows]}}, applying docs in order."""
    per_table = {t: {} for t in TABLES}
    for _, path in sorted(docs):
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
        tables = doc.get("Tables") or {}
        for table, key_cols in KEYS.items():
            rows = tables.get(table) or []
            grouped = {}
            for row in rows:
                grouped.setdefault(tuple(row[c] for c in key_cols), []).append(row)
            per_table[table].update(grouped)  # a later doc replaces every key it carries
    return per_table


# ---------------------------------------------------------------- parquet

def to_arrow(rows, schema):
    columns = {}
    for field in schema:
        values = [r.get(field.name) for r in rows]
        if pa.types.is_timestamp(field.type):
            values = [parse_utc(v) for v in values]
        columns[field.name] = pa.array(values, type=field.type)
    return pa.table(columns, schema=schema)


def rewrite_table(con, table, keyed_rows, src_path, dst_path):
    schema = pq.read_schema(src_path)
    rows = [r for group in keyed_rows.values() for r in group]
    keys = sorted(keyed_rows)
    key_cols = KEYS[table]
    new_rows = to_arrow(rows, schema)
    key_table = pa.table({c: pa.array([k[i] for k in keys], type=schema.field(c).type) for i, c in enumerate(key_cols)})
    con.register("new_rows", new_rows)
    con.register("replaced_keys", key_table)
    cols = ", ".join(f'"{f.name}"' for f in schema)
    using = ", ".join(f'"{c}"' for c in key_cols)
    tmp = dst_path + ".tmp"
    con.execute(f"""
        COPY (
            SELECT {cols} FROM read_parquet('{src_path}') e
            ANTI JOIN replaced_keys k USING ({using})
            UNION ALL
            SELECT {cols} FROM new_rows
        ) TO '{tmp}' (FORMAT PARQUET, COMPRESSION SNAPPY)
    """)
    os.replace(tmp, dst_path)
    con.unregister("new_rows")
    con.unregister("replaced_keys")
    return len(rows), len(keys)


def rebuild_by_card(con, out_dir):
    src = os.path.join(out_dir, "gamecards.parquet")
    dst = os.path.join(out_dir, "gamecards_by_card.parquet")
    tmp = dst + ".tmp"
    con.execute(f"""
        COPY (SELECT * FROM read_parquet('{src}') ORDER BY Card, TableId)
        TO '{tmp}' (FORMAT PARQUET, COMPRESSION SNAPPY, ROW_GROUP_SIZE 50000)
    """)
    os.replace(tmp, dst)


def open_duckdb(temp_dir):
    import duckdb

    os.makedirs(temp_dir, exist_ok=True)
    con = duckdb.connect()
    con.execute("SET memory_limit='1500MB'")
    con.execute("SET threads=1")
    con.execute(f"SET temp_directory='{temp_dir}'")
    con.execute("SET TimeZone='UTC'")
    return con


# ---------------------------------------------------------------- main

def bootstrap(data_dir, out_dir, export_start):
    """Copy the eleven files from the SQL export and set the watermark to that export's start."""
    if os.path.abspath(data_dir) == os.path.abspath(out_dir):
        sys.exit("--bootstrap needs an --out-dir different from --data-dir")
    os.makedirs(out_dir, exist_ok=True)
    oldest = None
    for table in TABLES:
        src = os.path.join(data_dir, f"{table}.parquet")
        shutil.copy2(src, os.path.join(out_dir, f"{table}.parquet"))
        mtime = dt.datetime.fromtimestamp(os.path.getmtime(src), dt.timezone.utc).replace(tzinfo=None)
        oldest = mtime if oldest is None or mtime < oldest else oldest
    if export_start is not None:
        watermark = export_start - dt.timedelta(minutes=1)
    else:
        # No run record: the export reads the tables one after another, so start well before the
        # first file. Docs re-applied needlessly are harmless (same rows, same keys).
        watermark = oldest - dt.timedelta(minutes=30)
    write_watermark(out_dir, watermark, 0)
    log(f"bootstrapped {out_dir} from {data_dir}; watermark {watermark:%Y-%m-%dT%H:%M:%S}Z"
        f" ({'export start' if export_start is not None else 'oldest file - 30 min'})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", default=os.path.join(HERE, "data"), help="the SQL export (bootstrap source)")
    ap.add_argument("--out-dir", default=None, help="where the stats parquet files live and are rewritten (default: data-dir)")
    ap.add_argument("--docs-dir", default=None, help="read documents from this directory instead of blob storage")
    ap.add_argument("--since", default=None, help="override the watermark (ISO-8601 UTC)")
    ap.add_argument("--bootstrap", action="store_true", help="copy data-dir's stats files to out-dir and set the watermark")
    ap.add_argument("--bootstrap-if-missing", action="store_true",
                    help="bootstrap instead of failing when out-dir has no watermark yet (for the cron job's first run)")
    ap.add_argument("--by-card", action="store_true", help="also rebuild gamecards_by_card.parquet when gamecards changed")
    ap.add_argument("--temp-dir", default="/mnt/duckdb-tmp")
    ap.add_argument("--keep-incoming", action="store_true", help="do not delete downloaded documents after applying them")
    ap.add_argument("--export-records", default="~/logs/runs/db-export_*.json",
                    help="run records of the SQL export (run_with_record.sh), used for the export start time")
    ap.add_argument("--until-export-start", action="store_true",
                    help="apply only documents written up to the latest SQL export's start, and advance the watermark to it")
    args = ap.parse_args()
    out_dir = args.out_dir or args.data_dir

    export_start = latest_export_start(args.export_records)
    if args.bootstrap or (args.bootstrap_if_missing and read_watermark(out_dir) is None):
        bootstrap(args.data_dir, out_dir, export_start)
        return

    started = time.time()
    since = parse_utc(args.since) if args.since else read_watermark(out_dir)
    if since is None:
        sys.exit(f"no {WATERMARK_FILE} in {out_dir}: run with --bootstrap first, or pass --since")

    until = None
    if args.until_export_start:
        if export_start is None:
            sys.exit(f"--until-export-start: no run record matches {args.export_records}")
        until = export_start
        if until <= since:
            log(f"export start {until:%Y-%m-%dT%H:%M:%S}Z is not after the watermark {since:%Y-%m-%dT%H:%M:%S}Z; nothing to do")
            return

    if args.docs_dir:
        docs = [(m, p) for m, p in local_docs(args.docs_dir) if m > since]
    else:
        docs = fetch_new_docs(since, os.path.join(out_dir, "incoming"))
    if until is not None:
        docs = [(m, p) for m, p in docs if m <= until]
    log(f"{len(docs)} document(s) since {since:%Y-%m-%dT%H:%M:%S}Z" + (f" up to {until:%Y-%m-%dT%H:%M:%S}Z" if until else ""))
    if not docs:
        if until is not None:
            write_watermark(out_dir, until, 0)
        return

    per_table = collect_rows(docs)
    con = open_duckdb(args.temp_dir)
    changed = []
    for table in TABLES:
        keyed = per_table[table]
        if not keyed:
            continue
        dst = os.path.join(out_dir, f"{table}.parquet")
        src = dst if os.path.exists(dst) else os.path.join(args.data_dir, f"{table}.parquet")
        t0 = time.time()
        n_rows, n_keys = rewrite_table(con, table, keyed, src, dst)
        log(f"{table}: replaced {n_keys} key(s) with {n_rows} row(s) in {time.time() - t0:.0f}s")
        changed.append(table)
    if args.by_card and "gamecards" in changed:
        t0 = time.time()
        rebuild_by_card(con, out_dir)
        log(f"gamecards_by_card rebuilt in {time.time() - t0:.0f}s")
    con.close()

    newest = until if until is not None else max(m for m, _ in docs)
    write_watermark(out_dir, newest, len(docs))
    if not args.docs_dir and not args.keep_incoming:
        for _, path in docs:
            os.remove(path)
    log(f"done: {len(docs)} document(s), {len(changed)} table(s) rewritten, watermark {newest:%Y-%m-%dT%H:%M:%S}Z, {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
