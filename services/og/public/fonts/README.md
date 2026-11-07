# Bundled fonts

Every font a theme draws with ships here and is read from disk at render time, so a card never waits on a font CDN.

`<id>/latin-<weight>-<style>.ttf` are latin TTF cuts from Fontsource 5.3.0 (Satori needs TTF/OTF, not woff2):

```
https://cdn.jsdelivr.net/fontsource/fonts/<id>@5.3.0/latin-<weight>-<style>.ttf
```

| Folder | Family | Used by |
|--------|--------|---------|
| `inter` | Inter 400/600/700, plus `cyrillic-<weight>-normal.ttf` cuts | Every kit card; the Cyrillic cuts only for `character` names |
| `libre-baskerville` | Libre Baskerville 400/700 | Every kit card |

All are under the SIL Open Font License 1.1, and each folder carries its `LICENSE`. Only add fonts under an open licence: commercial faces such as Friz Quadrata must not be bundled here.

CJK glyphs are not bundled: a full Noto CJK face is around 10 MB per weight. `app/api/og/themes/cjk-fonts.ts` fetches a subset with just the characters on the card instead.
