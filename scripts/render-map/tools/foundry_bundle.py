#!/usr/bin/env python3
"""Build a deterministic Map Foundry import bundle from local staging metadata."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import stat
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any

FORMAT = "chronicle-map-foundry-bundle-v1"
MAX_ASSET_BYTES = 100 * 1024 * 1024
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
NAMESPACE_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LIQUID_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class BundleError(ValueError):
    """Raised when staging metadata or a staged asset is invalid."""


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BundleError(f"{label} must be an object")
    return value


def _list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list) or not value:
        raise BundleError(f"{label} must be a non-empty array")
    return value


def _integer(value: Any, label: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise BundleError(f"{label} must be an integer >= {minimum}")
    return value


def _number(value: Any, label: str) -> int | float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise BundleError(f"{label} must be a finite number")
    return value


def _string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BundleError(f"{label} must be a non-empty string")
    return value


def _bounds(value: Any, label: str) -> dict[str, int | float]:
    obj = _object(value, label)
    expected = {"minX", "maxX", "minY", "maxY"}
    if set(obj) != expected:
        raise BundleError(f"{label} must contain exactly {sorted(expected)}")
    result = {key: _number(obj[key], f"{label}.{key}") for key in sorted(expected)}
    if result["minX"] >= result["maxX"] or result["minY"] >= result["maxY"]:
        raise BundleError(f"{label} must have minX < maxX and minY < maxY")
    return {key: result[key] for key in ("minX", "maxX", "minY", "maxY")}


def _sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _asset_file(value: Any, label: str) -> tuple[Path, int, str]:
    obj = _object(value, label)
    path = Path(_string(obj.get("path"), f"{label}.path")).expanduser()
    expected_bytes = _integer(obj.get("bytes"), f"{label}.bytes")
    expected_sha256 = _string(obj.get("sha256"), f"{label}.sha256")
    if not SHA256_RE.fullmatch(expected_sha256):
        raise BundleError(f"{label}.sha256 must be 64 lowercase hexadecimal characters")
    if not path.is_file():
        raise BundleError(f"{label}.path is not a local file: {path}")
    actual_bytes = path.stat().st_size
    if actual_bytes > MAX_ASSET_BYTES:
        raise BundleError(f"{label} exceeds the 100 MB Foundry asset limit: {actual_bytes} bytes")
    if actual_bytes != expected_bytes:
        raise BundleError(
            f"{label}.bytes is {expected_bytes}, but {path} is {actual_bytes} bytes"
        )
    actual_sha256 = _sha256_path(path)
    if actual_sha256 != expected_sha256:
        raise BundleError(
            f"{label}.sha256 is {expected_sha256}, but {path} hashes to {actual_sha256}"
        )
    return path, actual_bytes, actual_sha256


def _liquid(value: Any, label: str) -> dict[str, Any]:
    obj = _object(value, label)
    if set(obj) != {"color", "opacity"}:
        raise BundleError(f"{label} must contain exactly color and opacity")
    color = _string(obj["color"], f"{label}.color")
    if not LIQUID_COLOR_RE.fullmatch(color):
        raise BundleError(f"{label}.color must be a six-digit CSS hex color")
    opacity = _number(obj["opacity"], f"{label}.opacity")
    if not 0 < opacity <= 1:
        raise BundleError(f"{label}.opacity must be greater than 0 and at most 1")
    return {"color": color.lower(), "opacity": opacity}


def _input_maps(stage: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    namespace = _string(stage.get("namespace"), "namespace")
    if not NAMESPACE_RE.fullmatch(namespace):
        raise BundleError("namespace must use lowercase letters, numbers, and single hyphens")
    if "maps" in stage:
        maps = [_object(value, f"maps[{index}]") for index, value in enumerate(
            _list(stage["maps"], "maps")
        )]
    else:
        maps = [stage]
    return namespace, maps


def build_manifest(stage: dict[str, Any]) -> tuple[dict[str, Any], list[tuple[str, Path]]]:
    """Validate staging metadata and return the portable manifest and archive assets."""
    namespace, staged_maps = _input_maps(stage)
    map_ids: set[int] = set()
    archive_names: set[str] = {"foundry.json"}
    manifest_maps: list[dict[str, Any]] = []
    assets: list[tuple[str, Path]] = []

    for map_index, staged_map in enumerate(staged_maps):
        map_label = f"maps[{map_index}]" if "maps" in stage else "map"
        map_id = _integer(staged_map.get("mapID"), f"{map_label}.mapID")
        if map_id in map_ids:
            raise BundleError(f"duplicate mapID: {map_id}")
        map_ids.add(map_id)
        name = _string(staged_map.get("name"), f"{map_label}.name")
        floors = _list(staged_map.get("floors"), f"{map_label}.floors")
        floor_ids: set[int] = set()
        manifest_floors: list[dict[str, Any]] = []

        for floor_index, value in enumerate(floors):
            floor_label = f"{map_label}.floors[{floor_index}]"
            floor = _object(value, floor_label)
            floor_id = _integer(floor.get("floor"), f"{floor_label}.floor")
            if floor_id in floor_ids:
                raise BundleError(f"duplicate floor {floor_id} for mapID {map_id}")
            floor_ids.add(floor_id)

            render = _object(floor.get("render"), f"{floor_label}.render")
            mesh = _object(floor.get("mesh"), f"{floor_label}.mesh")
            render_path, render_bytes, render_sha256 = _asset_file(
                render, f"{floor_label}.render"
            )
            mesh_path, mesh_bytes, mesh_sha256 = _asset_file(mesh, f"{floor_label}.mesh")
            render_suffix = render_path.suffix.lower()
            if render_suffix not in {".png", ".webp"}:
                raise BundleError(f"{floor_label}.render.path must end in .png or .webp")
            if mesh_path.suffix.lower() != ".glb":
                raise BundleError(f"{floor_label}.mesh.path must end in .glb")

            render_bounds = _bounds(render.get("bounds"), f"{floor_label}.render.bounds")
            mesh_bounds = _bounds(mesh.get("bounds"), f"{floor_label}.mesh.bounds")
            if render_bounds != mesh_bounds:
                raise BundleError(f"render and mesh bounds differ for mapID {map_id} floor {floor_id}")
            width = _integer(render.get("width"), f"{floor_label}.render.width", minimum=1)
            height = _integer(render.get("height"), f"{floor_label}.render.height", minimum=1)
            if width > 32768 or height > 32768:
                raise BundleError(f"{floor_label}.render dimensions exceed 32768 pixels")
            z_min = _number(mesh.get("zMin"), f"{floor_label}.mesh.zMin")
            z_max = _number(mesh.get("zMax"), f"{floor_label}.mesh.zMax")
            if z_min >= z_max:
                raise BundleError(f"{floor_label}.mesh must have zMin < zMax")
            frame = _string(mesh.get("frame"), f"{floor_label}.mesh.frame")
            if frame != "wow-yup-mirrored-x":
                raise BundleError(f"{floor_label}.mesh.frame must be wow-yup-mirrored-x")

            prefix = f"maps/{map_id}/floor-{floor_id}"
            render_archive = f"{prefix}/render{render_suffix}"
            mesh_archive = f"{prefix}/mesh.glb"
            for archive_name in (render_archive, mesh_archive):
                if archive_name in archive_names:
                    raise BundleError(f"duplicate archive path: {archive_name}")
                archive_names.add(archive_name)
            assets.extend(((render_archive, render_path), (mesh_archive, mesh_path)))

            render_manifest = {
                "file": render_archive,
                "width": width,
                "height": height,
                "bounds": render_bounds,
                "bytes": render_bytes,
                "sha256": render_sha256,
            }
            mesh_manifest: dict[str, Any] = {
                "file": mesh_archive,
                "bounds": mesh_bounds,
                "zMin": z_min,
                "zMax": z_max,
                "frame": frame,
                "bytes": mesh_bytes,
                "sha256": mesh_sha256,
            }
            if "liquid" in mesh:
                mesh_manifest["liquid"] = _liquid(mesh["liquid"], f"{floor_label}.mesh.liquid")
            floor_manifest: dict[str, Any] = {
                "floor": floor_id,
                "render": render_manifest,
                "mesh": mesh_manifest,
            }
            if "name" in floor:
                floor_manifest["name"] = _string(floor["name"], f"{floor_label}.name")
            preferred_2d = floor.get("preferred2D", "renders")
            preferred_2d = _string(preferred_2d, f"{floor_label}.preferred2D")
            if preferred_2d not in {"renders", "art"}:
                raise BundleError(f"{floor_label}.preferred2D must be renders or art")
            floor_manifest["preferred2D"] = preferred_2d
            manifest_floors.append(floor_manifest)

        manifest_maps.append({
            "mapID": map_id,
            "name": name,
            "floors": sorted(manifest_floors, key=lambda item: item["floor"]),
        })

    manifest = {
        "format": FORMAT,
        "namespace": namespace,
        "maps": sorted(manifest_maps, key=lambda item: item["mapID"]),
    }
    return manifest, sorted(assets, key=lambda item: item[0])


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode(
        "utf-8"
    )


def _zip_info(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, ZIP_TIMESTAMP)
    info.compress_type = zipfile.ZIP_STORED
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | 0o644) << 16
    return info


def _verify_archive(path: Path, manifest: dict[str, Any]) -> None:
    expected: dict[str, tuple[int, str]] = {}
    for map_entry in manifest["maps"]:
        for floor in map_entry["floors"]:
            for asset_type in ("render", "mesh"):
                asset = floor[asset_type]
                expected[asset["file"]] = (asset["bytes"], asset["sha256"])
    with zipfile.ZipFile(path) as bundle:
        expected_names = {"foundry.json", *expected}
        if set(bundle.namelist()) != expected_names:
            raise BundleError("written archive entries do not match foundry.json")
        if bundle.read("foundry.json") != _json_bytes(manifest):
            raise BundleError("written foundry.json does not match the validated manifest")
        for archive_name, (expected_bytes, expected_sha256) in expected.items():
            info = bundle.getinfo(archive_name)
            if info.file_size != expected_bytes:
                raise BundleError(f"written {archive_name} has an unexpected byte count")
            digest = hashlib.sha256()
            with bundle.open(info) as asset:
                for chunk in iter(lambda: asset.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != expected_sha256:
                raise BundleError(f"written {archive_name} has an unexpected SHA-256")


def write_bundle(output: Path, manifest: dict[str, Any], assets: list[tuple[str, Path]]) -> None:
    """Write a normalized ZIP_STORED archive atomically."""
    output = output.expanduser()
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{output.name}.", dir=output.parent)
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as bundle:
            bundle.writestr(_zip_info("foundry.json"), _json_bytes(manifest))
            for archive_name, local_path in assets:
                with local_path.open("rb") as asset, bundle.open(
                    _zip_info(archive_name), "w"
                ) as archived_asset:
                    shutil.copyfileobj(asset, archived_asset, length=1024 * 1024)
        _verify_archive(temporary, manifest)
        temporary.replace(output)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def default_output(stage_path: Path) -> Path:
    stem = stage_path.stem
    if stem.endswith("-foundry-stage"):
        stem = stem.removesuffix("-foundry-stage")
    return stage_path.with_name(f"{stem}-foundry-bundle.zip")


def load_stage(stage_path: Path) -> dict[str, Any]:
    try:
        return _object(json.loads(stage_path.read_text(encoding="utf-8")), "staging JSON")
    except OSError as error:
        raise BundleError(f"cannot read staging JSON {stage_path}: {error}") from error
    except json.JSONDecodeError as error:
        raise BundleError(f"invalid staging JSON {stage_path}: {error}") from error


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("staging_json", type=Path)
    parser.add_argument("output", nargs="?", type=Path)
    parser.add_argument("-o", "--output", dest="output_option", type=Path)
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate metadata and assets without writing an archive",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        if args.output is not None and args.output_option is not None:
            raise BundleError("output may be supplied either positionally or with --output, not both")
        manifest, assets = build_manifest(load_stage(args.staging_json))
        if args.check:
            print(
                f"valid: {len(manifest['maps'])} map(s), {len(assets)} asset(s), "
                f"namespace {manifest['namespace']}"
            )
            return 0
        output = args.output_option or args.output or default_output(args.staging_json)
        write_bundle(output, manifest, assets)
        digest = _sha256_path(output)
        print(f"wrote {output} ({output.stat().st_size} bytes, sha256 {digest})")
        return 0
    except (BundleError, OSError, zipfile.BadZipFile) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
