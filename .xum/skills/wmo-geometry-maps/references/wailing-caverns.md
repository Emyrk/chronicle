# Wailing Caverns geometry map case study

This records the experiment that produced the `wmo-geometry-maps` workflow. It is a reproducible research result, not a production map asset.

## Contents

- [Source target](#source-target)
- [Map and file discovery](#map-and-file-discovery)
- [Geometry result](#geometry-result)
- [Artistic floor comparison](#artistic-floor-comparison)
- [Conclusions](#conclusions)

## Source target

The experiment pinned this exact target:

```text
source: remote
region: us
product: wow_classic_beta
locale: enUS
build: 1.60.1.70338
```

Never assume these IDs carry to another build. Query the selected build again when reproducing the work.

## Map and file discovery

The `Map` DB2 row was:

| Field | Value |
|---|---:|
| ID | 43 |
| Name | Wailing Caverns |
| Directory | WailingCaverns |
| InstanceType | 1 |
| MapType | 2 |
| WdtFileDataID | 791429 |

No usable minimap tile set existed under either `world/minimaps/43/` or `world/minimaps/wailingcaverns/`. The dungeon is represented as a global WMO.

The WDT contained these reversed-on-disk chunks:

```text
MVER MPHD MAIN MAID MODF
```

Its single 64-byte `MODF` placement referenced root WMO FileDataID `7952328`. The listfile resolved that ID to `world/wmo/autogen-names/unknown/21066.wmo`. The placement had zero position, zero rotation, flags 8, and scale 1024, which decodes to 1.0.

A similarly named legacy root existed under `world/wmo/dungeon/kl_wailing/`, but its geometry did not match the current WDT placement. The experiment therefore used the FileDataID referenced by `MODF`, not the name match.

The root WMO's `GFID` chunk contained 23 group FileDataIDs, consecutively numbered `7953467` through `7953489`.

## Geometry result

Parsing `MOVT` vertices and `MOVI` triangle indices from all 23 groups produced:

```text
groups: 23
triangles: 170179
vertex minimum: [-187.47615, -538.3512, -119.16052]
vertex maximum: [389.07004, 369.7501, 56.468933]
```

The renderer sorted triangles by average Z, shaded them using elevation and the magnitude of the face's Z normal, and projected `-Y` to screen-right and `-X` to screen-down. The comparison canvas was 1002 by 668 pixels with one uniform scale.

The render exposes the broad cavern route and room layout, but it also includes floors, ceilings, walls, exterior shells, props, and vertically stacked spaces. It is a geometry diagnostic rather than a clean navigational floor plan.

## Artistic floor comparison

The Blizzard floor art is a 12-tile, 4-by-3 canvas reconstructed at 1002 by 668 pixels. Chronicle's floor-art bounds were:

```text
minX: -375.946014
maxX: 560.528992
minY: -410.145996
maxY: 214.169998
```

Eight boss telemetry anchors and artistic pins were used to test a single global affine fit:

| Entry | Telemetry X | Telemetry Y | Art left % | Art top % |
|---:|---:|---:|---:|---:|
| 3671 | 15.04 | 300.08 | 30.6 | 43.0 |
| 3670 | 36.81 | -241.06 | 19.1 | 39.5 |
| 3669 | -151.14 | 414.37 | 16.7 | 56.8 |
| 3653 | -6.38 | 204.62 | 38.5 | 36.1 |
| 3674 | -279.00 | -314.00 | 62.3 | 74.4 |
| 3673 | -118.78 | -25.08 | 61.6 | 53.9 |
| 5775 | -84.95 | 29.65 | 55.5 | 46.5 |
| 3654 | 138.90 | 250.94 | 34.6 | 13.7 |

The least-squares affine mapping from the two telemetry coordinates to artistic pixels was approximately:

```text
left = -0.5239718*x - 0.2400130*y + 388.5682
top  = -0.8535330*x - 0.0328493*y + 258.4425
```

Per-anchor Euclidean residuals were approximately 51.5, 237.5, 201.1, 45.9, 17.2, 160.4, 131.6, and 99.6 pixels. The mean residual was 118.1 pixels and the maximum was 237.5 pixels.

The large, region-dependent errors confirm that the floor art is locally rearranged, rescaled, and flattened. No single affine transform can align the entire dungeon. Chronicle therefore uses boss-local calibration in `frontend/chronicle/src/pages/Instance/EventsPanels/Map/mapModel.ts` instead of pretending the artwork has one authoritative world transform.

## Conclusions

- Resolve geometry through the WDT's FileDataIDs, not a plausible legacy filename.
- Preserve one uniform geometry scale. Do not warp generated geometry to make it resemble the artwork.
- Treat artist-map affine fitting as a distortion diagnostic only.
- Group telemetry by unit GUID before drawing paths.
- A production geometry map needs walkable-surface selection and elevation-band separation.
- Do not publish this experiment through the shared Forever map manifest without designing and reviewing a floor and coordinate contract.

The generated comparison images were intentionally not committed. They include reconstructed Blizzard artwork and can be recreated from the pinned build with the workflow in `../SKILL.md`.
