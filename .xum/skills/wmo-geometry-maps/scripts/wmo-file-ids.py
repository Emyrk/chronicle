#!/usr/bin/env python3
"""Extract FileDataIDs from modern WoW WDT and WMO chunk files."""

from __future__ import annotations

import argparse
import json
import struct
import sys
from collections.abc import Iterator
from pathlib import Path


def chunks(data: bytes) -> Iterator[tuple[str, bytes]]:
    offset = 0
    while offset + 8 <= len(data):
        raw_tag = data[offset : offset + 4]
        size = struct.unpack_from("<I", data, offset + 4)[0]
        payload_start = offset + 8
        payload_end = payload_start + size
        if payload_end > len(data):
            raise ValueError(
                f"chunk at byte {offset} declares {size} bytes past end of file"
            )
        try:
            tag = raw_tag[::-1].decode("ascii")
        except UnicodeDecodeError as error:
            raise ValueError(f"invalid chunk tag at byte {offset}: {raw_tag!r}") from error
        yield tag, data[payload_start:payload_end]
        offset = payload_end

    if offset != len(data):
        raise ValueError(f"{len(data) - offset} trailing bytes after final chunk")


def wdt_placements(data: bytes) -> list[dict[str, object]]:
    placements: list[dict[str, object]] = []
    for tag, payload in chunks(data):
        if tag != "MODF":
            continue
        if len(payload) % 64 != 0:
            raise ValueError(f"MODF size {len(payload)} is not a multiple of 64")
        for offset in range(0, len(payload), 64):
            file_data_id, unique_id = struct.unpack_from("<II", payload, offset)
            position = struct.unpack_from("<3f", payload, offset + 8)
            rotation = struct.unpack_from("<3f", payload, offset + 20)
            bounds = struct.unpack_from("<6f", payload, offset + 32)
            flags, doodad_set, name_set, scale = struct.unpack_from(
                "<4H", payload, offset + 56
            )
            placements.append(
                {
                    "fileDataID": file_data_id,
                    "uniqueID": unique_id,
                    "position": position,
                    "rotation": rotation,
                    "bounds": {"minimum": bounds[:3], "maximum": bounds[3:]},
                    "flags": flags,
                    "doodadSet": doodad_set,
                    "nameSet": name_set,
                    "scale": scale / 1024.0,
                }
            )
    return placements


def wdt_roots(data: bytes) -> list[int]:
    return [int(placement["fileDataID"]) for placement in wdt_placements(data)]


def wmo_groups(data: bytes) -> list[int]:
    groups: list[int] = []
    for tag, payload in chunks(data):
        if tag != "GFID":
            continue
        if len(payload) % 4 != 0:
            raise ValueError(f"GFID size {len(payload)} is not a multiple of 4")
        groups.extend(struct.unpack(f"<{len(payload) // 4}I", payload))
    return groups


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract WMO root IDs from WDT MODF or group IDs from WMO GFID"
    )
    parser.add_argument(
        "mode", choices=("wdt-roots", "wdt-placements", "wmo-groups")
    )
    parser.add_argument("file", type=Path)
    args = parser.parse_args()

    try:
        data = args.file.read_bytes()
        if args.mode == "wdt-placements":
            placements = wdt_placements(data)
            if not placements:
                print(f"no placements found for mode {args.mode}", file=sys.stderr)
                return 1
            json.dump(placements, sys.stdout, indent=2)
            print()
            return 0
        ids = wdt_roots(data) if args.mode == "wdt-roots" else wmo_groups(data)
    except (OSError, ValueError) as error:
        parser.error(str(error))

    if not ids:
        print(f"no IDs found for mode {args.mode}", file=sys.stderr)
        return 1

    for file_data_id in ids:
        print(file_data_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
