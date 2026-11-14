# Asset sources and licenses

Everything the product ships that was not written in this repository is listed here with its origin
and license. **No other third-party artwork is used**: no stock illustrations, no icon fonts, no
screenshots of other products, no generated imagery, no brand assets. The product name itself is a
placeholder read from `shared/brand.ts`.

## Fonts (self-hosted)

| Font | Package | Version | License | Used as |
| --- | --- | --- | --- | --- |
| Manrope Variable | `@fontsource-variable/manrope` | 5.3.0 | SIL Open Font License 1.1 | `--font-display` (headings, app titles) |
| DM Sans Variable | `@fontsource-variable/dm-sans` | 5.3.0 | SIL Open Font License 1.1 | `--font-body` (body text) |

The fonts are bundled with the client from the packages above and served from our own origin; no
font CDN is contacted. The OFL text and the copyright notices of the upstream type designers ship
inside each package (`node_modules/@fontsource-variable/<name>/LICENSE`). The OFL permits bundling
and redistribution with software; the fonts are not sold on their own.

## Icons

| Set | License | Where |
| --- | --- | --- |
| Lucide | ISC (https://lucide.dev) | `lucide-react` 1.73.0 in the client; flattened single-path glyphs in `shared/icons.ts` (`ICON_PATHS`) |

The glyphs in `shared/icons.ts` are Lucide paths flattened to single path strings so the same icon
renders as inline SVG in the browser, as PNG for home-screen icons (server-side) and as launcher
shortcut bitmaps on Android without a font. The ISC notice is reproduced in the header comment of
`shared/icons.ts`; the license text ships in `node_modules/lucide-react/LICENSE`.

## Photographs (example content)

Four photographs by **Fons Heijnsbroek**, released under **CC0 1.0** (public domain dedication) on
Wikimedia Commons. They were downloaded on 2026-11-14, resized to 960 px wide (JPEG) and stored in
`server/fixtures/media/light-1.jpg` … `light-4.jpg`; their provenance is machine-readable in
`server/fixtures/media/sources.json` (title, author, Commons page, license, original size).

| File | Title on Wikimedia Commons | Author | Commons page | License |
| --- | --- | --- | --- | --- |
| `light-1.jpg` | Streetview Amsterdam in sunlight and shadows - free photo, Fons Heijnsbroek | Fons Heijnsbroek | https://commons.wikimedia.org/wiki/File:Streetview_Amsterdam_in_sunlight_and_shadows_-_free_photo,_Fons_Heijnsbroek.jpg | CC0 |
| `light-2.jpg` | Sun and shadows of the urban trees on the pavement, in Sarphatistraat; free photo Amsterdam city, Fons Heijnsbroek 10-2021 | Fons Heijnsbroek | https://commons.wikimedia.org/wiki/File:Sun_and_shadows_of_the_urban_trees_on_the_pavement,_in_Sarphatistraat;_free_photo_Amsterdam_city,_Fons_Heijnsbroek_10-2021.jpg | CC0 |
| `light-3.jpg` | Sunlight and shadows of a tiny tree in Fall on a brick wall of Entrepotdok-buildings, Amsterdam city, along the canal Entrepotdok; on the border of the old city center of Amsterdam; urban photography, Fons Heijnsbroek 2013 (11132531654) | Fons Heijnsbroek from Amsterdam, Netherlands | https://commons.wikimedia.org/wiki/File:Sunlight_and_shadows_of_a_tiny_tree_in_Fall_on_a_brick_wall_of_Entrepotdok-buildings,_Amsterdam_city,_along_the_canal_Entrepotdok;_on_the_border_of_the_old_city_center_of_Amsterdam;_urban_photography,_Fons_Heijnsbroek_2013_(11132531654).jpg | CC0 |
| `light-4.jpg` | Photo of a facade garden with scaffolding in sunlight and shadows in the street Plantage Kerklaan, Amsterdam - free download photo in high resolution - street photography by Fons Heijnsbroek | Fons Heijnsbroek | https://commons.wikimedia.org/wiki/File:Photo_of_a_facade_garden_with_scaffolding_in_sunlight_and_shadows_in_the_street_Plantage_Kerklaan,_Amsterdam_-_free_download_photo_in_high_resolution_-_street_photography_by_Fons_Heijnsbroek.jpg | CC0 |

CC0 requires no attribution; it is given anyway. Where the photos appear:

- `GET /examples/light-1.jpg` … `light-4.jpg`: public, used by app previews ("Example content") with
  the record value `example:light-N`, which is never stored as a real record.
- The seed (`server/scripts/seed.ts`) copies the four files into the **demo account's own media**
  through the normal upload path, so the demo Light app shows real, owner-scoped photo records. The
  demo captions say they are example photos.

## User uploads stay private

Photos people upload (`POST /api/media`) belong to the uploading account only. The bytes live under
`MEDIA_DIR` (git-ignored, default `data/media/`) and the `media` table is the owner-scoped index.
`GET /api/media/:id` serves a photo only to its owner (404 to anyone else), records with photo fields
may only reference the owner's media, uploads are never used as example content or previews for
anyone else, never sent to a third party (the Sample-mode agent does not read images at all; the live
model reads a photo only for the owner's own capture), and a photo is removed from disk when its
owner deletes it.
