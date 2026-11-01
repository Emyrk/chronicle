# Unit image manifest

Chronicle can associate arbitrary labeled images with creature entry IDs through a shared root-CDN manifest:

```text
https://icons.chronicleclassic.com/unit-images/manifest.json
```

The manifest is deliberately separate from the miniature registry. A unit can have images without a 3D miniature, and image consumers do not need to download or parse the model registry.

## Format

```json
{
  "format": "chronicle-unit-images-v1",
  "units": [
    {
      "name": "ony-onyxia",
      "display_name": "Onyxia",
      "entry_ids": [10184],
      "images": {
        "headshot": "unit-images/<content-hash>-onyxia-headshot.webp",
        "full": "unit-images/<content-hash>-onyxia-full.webp"
      }
    }
  ]
}
```

`images` is an open label-to-path map. `headshot` and `full` are initial conventions, not a closed enum. Future consumers can introduce labels such as `profile`, `card`, or `silhouette` without changing the manifest version.

## Constraints

- One unit record may own several creature entry IDs.
- A creature entry ID may belong to only one unit record.
- Registry `name` slugs, case-insensitive `display_name` values, and asset paths must be unique.
- `display_name` is the canonical human-readable lookup key. It is optional for backward compatibility with older records.
- Labels use lowercase letters, numbers, underscores, and hyphens, starting with a letter.
- Assets live directly under `unit-images/` and use AVIF, JPEG, PNG, or WebP.
- Asset filenames should be content-addressed so replacements are immutable and cache-safe.
- Publish image objects before publishing `manifest.json`; publish the manifest last so it never references missing objects.

The frontend parser and lookup helpers live in `frontend/chronicle/src/config/unitImages.ts`.

## Publishing

Create a local plan whose `images` values point to source files:

```json
[
  {
    "name": "ony-onyxia",
    "display_name": "Onyxia",
    "entry_ids": [10184],
    "images": {
      "headshot": "/path/to/onyxia-headshot.webp",
      "full": "/path/to/onyxia-full.webp"
    }
  }
]
```

For a metadata-only update to an existing record, such as adding `display_name`, omit `images`. The publisher preserves the record's current image paths. New records must include images.

Then run:

```bash
frontend/imagecache/upload-unit-images-r2.sh plan.json
frontend/imagecache/upload-unit-images-r2.sh plan.json --publish
```

The first command is a dry run. It fetches and merges the live manifest, validates ownership and paths, hashes the image files, and prints the result. `--publish` requires the configured `rclone` R2 remote. It uploads immutable images first and `manifest.json` last.
