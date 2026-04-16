"""Data-level normalizations applied in the SQL layer.

Some card/prelude names appear with inconsistent casing or spelling in the raw
parquet data. Rather than fix each at ingest time, we normalize on read. Add
entries here as new variants surface.
"""

CARD_NAME_FIXUPS: list[tuple[str, str]] = [
    ("Power plant", "Power Plant"),
]


def _sql_string(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def normalized_card_expr(col: str) -> str:
    """Wrap a Card column reference in a CASE that maps known variants to canonical names."""
    if not CARD_NAME_FIXUPS:
        return col
    whens = " ".join(
        f"WHEN {col} = {_sql_string(bad)} THEN {_sql_string(good)}"
        for bad, good in CARD_NAME_FIXUPS
    )
    return f"CASE {whens} ELSE {col} END"


def normalize_card_name(card: str) -> str:
    """Apply the same fixups in Python (for matching against URL params)."""
    for bad, good in CARD_NAME_FIXUPS:
        if card == bad:
            return good
    return card


def card_variants(canonical_name: str) -> list[str]:
    """Return every spelling that should be treated as the given canonical card name.

    Use with `WHERE Card IN (?, ?, ...)` on the raw column — preserves row-group
    pruning on sorted parquet, unlike wrapping Card in a CASE expression.
    """
    variants = [canonical_name]
    for bad, good in CARD_NAME_FIXUPS:
        if good == canonical_name and bad != canonical_name:
            variants.append(bad)
    return variants
