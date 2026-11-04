# Chronicle Sidekick branding

Canonical branding assets for Chronicle Sidekick.

- `SidekickLogo.svg`: self-contained master logo for scalable use.
- `SidekickLogo.png`: 512 px lossless raster export.
- `SidekickLogo.webp`: 512 px optimized raster export.
- `SidekickC.webp`: transparent branded Chronicle C layer used by the animated `/download` logo.
- `SidekickSwirl.gif`: motion reference for the occasional three-dot swirl.

The three dots replace the previous robot while preserving the original Chronicle C shape. The live `/download` animation is implemented as inline SVG so each dot can animate independently and respect `prefers-reduced-motion`.

Regenerate the social preview from `frontend/chronicle`:

```sh
NODE_PATH=./node_modules node scripts/og/render-og.cjs scripts/og/sidekick-og.html public/c/images/og/sidekick.jpg
```
