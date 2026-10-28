"""Pure helpers for render-map floor configuration and publication metadata."""
import re


_FLOOR_KEYS = {
    "id",
    "object_include_prefixes",
    "object_exclude_prefixes",
    "z_min",
    "z_max",
}


def _prefixes(value, field):
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list) or not value or not all(isinstance(v, str) and v for v in value):
        raise ValueError(f"floor.{field} must be a non-empty string or list of non-empty strings")
    return list(dict.fromkeys(value))


def resolve_floor(config, cli_floor=None):
    """Return normalized floor metadata, or None for the legacy map-level workflow."""
    raw = config.get("floor")
    if raw is None and cli_floor is None:
        return None
    if isinstance(raw, dict):
        unknown = sorted(set(raw) - _FLOOR_KEYS)
        if unknown:
            raise ValueError("unknown floor keys: " + ", ".join(unknown))
        floor_id = raw.get("id")
        selection = raw
    else:
        floor_id = raw
        selection = {}
    if cli_floor is not None:
        floor_id = cli_floor
    if isinstance(floor_id, bool) or not isinstance(floor_id, int) or floor_id < 0:
        raise ValueError("floor id must be a non-negative integer (set floor: <id>, floor.id, or --floor)")
    z_min, z_max = selection.get("z_min"), selection.get("z_max")
    for value, field in ((z_min, "z_min"), (z_max, "z_max")):
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
            raise ValueError(f"floor.{field} must be a number")
    if z_min is not None and z_max is not None and z_min >= z_max:
        raise ValueError("floor.z_min must be less than floor.z_max")
    return {
        "floor": floor_id,
        "object_include_prefixes": _prefixes(selection.get("object_include_prefixes"), "object_include_prefixes"),
        "object_exclude_prefixes": _prefixes(selection.get("object_exclude_prefixes"), "object_exclude_prefixes"),
        "z_min": z_min,
        "z_max": z_max,
    }


def floor_token(floor):
    return None if floor is None else f"floor-{floor['floor']}"


def version_name(number, label, floor):
    label = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    prefix = f"v{number:03d}"
    token = floor_token(floor)
    if token:
        prefix += "-" + token
    return prefix + "-" + label


def asset_slug(slug, floor):
    token = floor_token(floor)
    return f"{slug}-{token}" if token else slug


def publication_render_entry(map_id, render, floor):
    """Build the Foundry layer instance entry while preserving legacy map-level renders."""
    entry = {"mapID": map_id}
    if floor is None:
        entry["renders"] = render
    else:
        entry["floors"] = [{"floor": floor["floor"], "renders": render}]
    return entry


def publication_mesh_entry(map_id, mesh, floor):
    """Build the Foundry layer instance entry while preserving legacy map-level meshes."""
    entry = {"mapID": map_id}
    if floor is None:
        entry["mesh"] = mesh
    else:
        entry["floors"] = [{"floor": floor["floor"], "mesh": mesh}]
    return entry
