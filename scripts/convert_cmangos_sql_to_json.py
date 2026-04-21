#!/usr/bin/env python3
"""Convert a cmangos/mangos MySQL item dump (unmodified.sql) to JSON.

Supports both WotLK (cmangos) and Classic (mangos) column naming conventions.
Columns already matching our DB names are passed through; cmangos-style names
are remapped automatically.

Usage:
    python3 scripts/convert_cmangos_sql_to_json.py <input.sql> <output.json>

Examples:
    # WotLK (cmangos/wotlk-db)
    python3 scripts/convert_cmangos_sql_to_json.py /tmp/wotlk-item-db/db/unmodified.sql importdata/world/warmane/world_item_template.json

    # Classic (thatsmybis/classic-wow-item-db)
    python3 scripts/convert_cmangos_sql_to_json.py /tmp/classic-wow-item-db/db/unmodified.sql importdata/world/kronos/world_item_template.json
"""

import json
import re
import sys

# MySQL column name -> our DB column name.
# Columns mapped to None are skipped entirely.
# Columns not listed here are passed through unchanged.
COLUMN_MAP = {
    # cmangos renames (WotLK uses these; classic already uses our names)
    "entry": "entry",
    "item_id": "entry",
    "displayid": "display_id",
    "Quality": "quality",
    "Flags": "flags",
    "Flags2": None,
    "BuyCount": "buy_count",
    "BuyPrice": "buy_price",
    "SellPrice": "sell_price",
    "InventoryType": "inventory_type",
    "AllowableClass": "allowable_class",
    "AllowableRace": "allowable_race",
    "ItemLevel": "item_level",
    "RequiredLevel": "required_level",
    "RequiredSkill": "required_skill",
    "RequiredSkillRank": "required_skill_rank",
    "requiredspell": "required_spell",
    "requiredhonorrank": "required_honor_rank",
    "RequiredCityRank": "required_city_rank",
    "RequiredReputationFaction": "required_reputation_faction",
    "RequiredReputationRank": "required_reputation_rank",
    "maxcount": "max_count",
    "ContainerSlots": "container_slots",
    "StatsCount": None,
    "ScalingStatDistribution": None,
    "ScalingStatValue": None,
    "RangedModRange": "range_mod",
    "spellppmRate_1": "spellppmrate_1",
    "spellppmRate_2": "spellppmrate_2",
    "spellppmRate_3": "spellppmrate_3",
    "spellppmRate_4": "spellppmrate_4",
    "spellppmRate_5": "spellppmrate_5",
    "PageText": "page_text",
    "LanguageID": "page_language",
    "PageMaterial": "page_material",
    "startquest": "start_quest",
    "lockid": "lock_id",
    "Material": "material",
    "RandomProperty": "random_property",
    "RandomSuffix": None,
    "itemset": "set_id",
    "MaxDurability": "max_durability",
    "area": "area_bound",
    "Map": "map_bound",
    "BagFamily": "bag_family",
    "TotemCategory": None,
    "socketColor_1": None,
    "socketContent_1": None,
    "socketColor_2": None,
    "socketContent_2": None,
    "socketColor_3": None,
    "socketContent_3": None,
    "socketBonus": None,
    "GemProperties": None,
    "RequiredDisenchantSkill": None,
    "ArmorDamageModifier": None,
    "Duration": "duration",
    "ItemLimitCategory": None,
    "HolidayId": None,
    "ScriptName": "script_name",
    "DisenchantID": "disenchant_id",
    "FoodType": "food_type",
    "minMoneyLoot": "min_money_loot",
    "maxMoneyLoot": "max_money_loot",
    "ExtraFlags": "extra_flags",
    # thatsmybis-added columns to skip
    "slot": None,
    "weight": None,
    "id": None,
    "unk0": None,
}


def parse_value(s: str, pos: int) -> tuple:
    """Parse a single MySQL value starting at pos. Returns (value, new_pos)."""
    if s[pos] == "'":
        # String value - find closing quote, handling escapes
        end = pos + 1
        while end < len(s):
            if s[end] == "\\":
                end += 2
                continue
            if s[end] == "'":
                raw = s[pos + 1 : end]
                # Unescape MySQL string escapes
                raw = raw.replace("\\'", "'").replace("\\\\", "\\")
                return raw, end + 1
            end += 1
        raise ValueError(f"Unterminated string at position {pos}")
    else:
        # Numeric or NULL
        end = pos
        while end < len(s) and s[end] not in (",", ")"):
            end += 1
        token = s[pos:end]
        if token == "NULL":
            return None, end
        # Try int first, then float
        try:
            return int(token), end
        except ValueError:
            return float(token), end


def parse_row(s: str, pos: int) -> tuple:
    """Parse a single (v1,v2,...) tuple. Returns (list_of_values, new_pos)."""
    assert s[pos] == "(", f"Expected '(' at {pos}, got '{s[pos]}'"
    pos += 1
    values = []
    while True:
        # Skip whitespace between values
        while pos < len(s) and s[pos] in (" ", "\t", "\n", "\r"):
            pos += 1
        val, pos = parse_value(s, pos)
        values.append(val)
        if s[pos] == ",":
            pos += 1
        elif s[pos] == ")":
            return values, pos + 1
        else:
            raise ValueError(f"Unexpected char '{s[pos]}' at {pos}")


def parse_insert(sql: str) -> tuple:
    """Parse all INSERT INTO `items`(col,...) values (...),(...); statements.
    Returns (column_names, list_of_row_tuples).
    """
    columns = None
    all_rows = []

    for m in re.finditer(
        r"insert\s+into\s+`items`\s*\(([^)]+)\)\s*values\s*",
        sql,
        re.IGNORECASE,
    ):
        cols = [c.strip().strip("`") for c in m.group(1).split(",")]
        if columns is None:
            columns = cols
        pos = m.end()

        while pos < len(sql):
            # Skip whitespace between rows
            while pos < len(sql) and sql[pos] in (" ", "\t", "\n", "\r"):
                pos += 1
            if pos >= len(sql):
                break
            if sql[pos] == "(":
                values, pos = parse_row(sql, pos)
                all_rows.append(values)
                if pos < len(sql) and sql[pos] == ",":
                    pos += 1
                elif pos < len(sql) and sql[pos] == ";":
                    break
            else:
                break

    if columns is None:
        return None, None
    return columns, all_rows


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.sql> <output.json>", file=sys.stderr)
        sys.exit(1)

    input_path, output_path = sys.argv[1], sys.argv[2]

    with open(input_path, "r", encoding="utf-8") as f:
        sql = f.read()

    columns, rows = parse_insert(sql)
    if columns is None:
        print("No INSERT INTO `items` statement found", file=sys.stderr)
        sys.exit(1)

    print(f"Parsed {len(rows)} rows with {len(columns)} columns", file=sys.stderr)

    # Build JSON objects with column remapping
    items = []
    for row in rows:
        obj = {}
        for i, col in enumerate(columns):
            if col in COLUMN_MAP:
                mapped = COLUMN_MAP[col]
                if mapped is None:
                    continue  # Explicitly skipped
            else:
                mapped = col  # Pass through unchanged
            val = row[i] if i < len(row) else 0
            obj[mapped] = val
        items.append(obj)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(items, f, separators=(",", ":"))

    print(f"Wrote {len(items)} items to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
