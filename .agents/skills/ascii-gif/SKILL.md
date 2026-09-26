---
name: ascii-gif
description: Mount an ascii-gif recipe and GIF as a looping webpage animation. Use when embedding ASCII animation from a recipe JSON, or when the user has a GIF to put on a site.
---

# ascii-gif

The demo at https://aimer779.github.io/404-copy/tools/ascii-gif/demo/ is the tuner. This skill **mounts** a finished recipe. Motion lives in the GIF; the recipe is look.

## Inputs

- The original GIF named in `recipe.source.name` (or `recipe.handoff.gif`)
- A recipe JSON with `tool: "ascii-gif"` and a `look` object
- Player code from this repository: `tools/ascii-gif/src/` and `tools/ascii-gif/vendor/gifuct.mjs`

Tuner: if the user has a GIF and no recipe, send them to the demo to export one, then continue.

## 1. Collect

Read the recipe as JSON. Confirm `tool` is `ascii-gif`, `look.columns` is a number, and `look.charAspect` is > 0. Place the GIF next to it.

Done: both files are in the host project and the recipe parses.

## 2. Copy the player

Copy `tools/ascii-gif/src` and `tools/ascii-gif/vendor` into the host as siblings (for example `ascii-gif/src` and `ascii-gif/vendor`).

Done: the page can import `./ascii-gif/src/mount.mjs`.

## 3. Mount

Give the host an explicit size or `aspect-ratio: <look.aspect>`. Then:

```js
import { mountAsciiGif, mountAsciiRecipe } from './ascii-gif/src/mount.mjs'

const recipe = await fetch('./clip-ascii.json').then((r) => r.json())
const slot = document.querySelector('#ascii-slot')
if (Array.isArray(recipe.clip?.frames) && recipe.clip.frames[0]?.coverage) {
  mountAsciiRecipe(slot, recipe)
} else {
  await mountAsciiGif(slot, './clip.gif', recipe)
}
```

Pass `look` through as exported. `look.color` and `look.mass` may be the site's resolved colors. If `look.font` names a face the host does not ship, load that font file before mount.

Done: the slot plays a looping ASCII clip whose columns, glyphs, font, ink, and paper match the recipe.

## 4. Check

Reload the host page. The animation loops. Columns, glyphs, font, ink, and paper match the recipe.
