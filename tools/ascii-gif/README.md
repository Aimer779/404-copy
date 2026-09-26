# ASCII GIF

The whole 404-copy project, including this tool, is inspired by the Bilibili video *[再花里胡哨一点？在网页里使用ASCII动画](https://www.bilibili.com/video/BV1H6eyzYE3V)* (BV1H6eyzYE3V).

Turn a GIF into a reusable character animation. The module decodes frames, composites disposal, samples grayscale, and draws to canvas. The host page supplies the clock and color.

Nothing is fetched from a CDN at runtime. `gifuct-js` ships as CommonJS; the browser build lives in `vendor/gifuct.mjs`.

## Pipeline

GIF → `parseGIF` / `decompressFrame` (with patch) → composite full frames by `disposalType` → store a grayscale grid → sample by column count and character aspect → the host clock picks a frame from each `delay` → draw glyphs to canvas.

`pixels` is a color-table index. Only `patch` after `buildPatch` is RGBA. Transparent pixels have alpha 0 and do not cover the frame below.

## Preview

From `404-copy/`, serve the files:

```powershell
python -m http.server 4174 --bind 127.0.0.1
```

Live: [https://aimer779.github.io/404-copy/tools/ascii-gif/demo/](https://aimer779.github.io/404-copy/tools/ascii-gif/demo/). The default subject is Squidward and playback starts paused.

Locally, from `404-copy/`, serve the files:

```powershell
python -m http.server 4174 --bind 127.0.0.1
```

Open `http://127.0.0.1:4174/tools/ascii-gif/demo/`.

- **Import GIF** reads a local file, converts it in the browser, and never uploads it.
- **Export recipe** opens a panel with editable JSON: columns, font, ink, mass, glyphs. The JSON does not include pixel grids. Copy or download `{source}-ascii.json`.
- **Copy for Agent** downloads the same recipe and copies install instructions. Send the original GIF with it.
- **Import recipe** restores the look knobs. Playback still needs the original GIF.
- **Export PNG** saves the current glyph frame, including the stage background.
- **Random recipe** (sparkles on the transport bar) rolls columns, font, glyphs, ink, and paper on the current GIF. Export recipe to keep that look.

**Font** picks a monospace face. Consolas is the default. VT323 is the pixel face.

The default subject is the same `assets/squidward.gif` as the 404 page. `?gif=` still accepts a URL: `?gif=../fixtures/bust.gif` for the bust fixture, `?gif=../fixtures/disposal.gif` for partial frames and disposal. `?recipe=` restores look knobs. Embed example: `demo/embed.html?recipe=./your-ascii.json&gif=../../../assets/squidward.gif`.

## Mounting on a site

A recipe is look settings: how to convert and how it should read. Motion still comes from the user's GIF. An agent takes the GIF, the JSON, and this tool, then decodes and plays on the site.

```js
import { mountAsciiGif } from './src/mount.mjs'

const recipe = await fetch('./bust-ascii.json').then((r) => r.json())
mountAsciiGif(document.querySelector('#ascii-slot'), './bust.gif', recipe)
```

Copy `src/`, `vendor/gifuct.mjs`, the recipe JSON, and the original GIF. The host needs an explicit size or `aspect-ratio`; `look.aspect` is the preview ratio. `look.color` and `look.mass` may use the site's resolved colors.

## Decoding a GIF at runtime

The 404 page still reads the GIF directly:

```js
import { loadAsciiClip, AsciiPlayer } from './src/index.mjs'

const clip = await loadAsciiClip(url, { pixelColumns: 180 })
const player = new AsciiPlayer(canvas, clip, {
  columns: 110,
  font: 'Consolas, ui-monospace, monospace',
  color: '#000013',
  ink: 'auto',
})

player.sync({
  time: gifTimeMs,
  color: inkColor,
})
```

`sync` belongs in an existing `requestAnimationFrame`. `time` selects the GIF frame. Changing `color` only changes the draw color.

Row count is `round(columns × content height / content width × character aspect)`. The content box is the opaque subject; empty padding does not consume columns. Character aspect is the advance width of `0` divided by the line height. If omitted, the player measures `font`. Start around 100–120 columns on desktop and 50–70 on a narrow screen.

Color is reduced to luma. `ink: 'auto'` reads paper from the first-frame corners, then stretches the subject's own dark-to-light range so eyes and a beak print harder than the body. The default glyph set is `01`, chosen by cell coordinates so the table does not reshuffle between frames. The demo can switch to `@%#*` glyphs, `█▓▒░` blocks, `@▓#*` mixed, or braille `⣿`. Density sets pick weight from coverage.

## Frame disposal

After a frame is shown:

- `0` and `1`: keep the frame.
- `2`: if the frame has a transparent color, erase its rectangle to transparent so the background color does not leave an opaque block. Restore the logical screen background only when there is no transparent color. `clearDisposal: 'background'` always restores the background; `clearDisposal: 'transparent'` always erases.
- `3`: restore the screen from before this frame.

`gifuct-js` reports a 0 centisecond delay as 100 ms. Playback uses the returned `delay`.

## Memory

Compositing reuses one screen buffer. Each frame keeps grayscale only: at most 360 cells across by default, one byte luma and one byte alpha per cell. Compressed source frames are held briefly during decode. If a clip is too large, switch to per-frame inflate later.

## Rebuild and test

```powershell
pnpm install
pnpm build
pnpm test
python test/make_fixtures.py
```

`pnpm test` checks that transparent pixels do not erase, disposal 2/3, partial frame size, original delay, that the bust head stays ink after sampling, and that recipe JSON round-trips.

## 404 page

The main page dynamically imports `src/index.mjs` and plays `assets/squidward.gif` inside `.data-mass`. Color follows `--ink`. Character frames follow GIF `delay`; outline and glitch stay on the 16-second clock. New site embeds should use recipe JSON + original GIF + `mountAsciiGif`.
