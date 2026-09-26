# ASCII GIF demo — baseline

Measured 2026-09-26. Cold cache, new browser context each run, 10 runs, p50 / p75 / p95. Usable = first ASCII ink on `#ascii` (center 120×120 sample) and Import GIF is clickable.

Chrome DevTools Fast 4G did **not** apply to `127.0.0.1` (loopback). Lab numbers are compute plus local `http.server`, not a 4G user. Live numbers are this machine to GitHub Pages on the real network. TTFB here is likely the path to GitHub, not the site itself. No CrUX yet (too little traffic).

## Time to usable

| Location | Network | usable p50 | usable p75 | usable p95 | TTFB p75 |
|---|---|---:|---:|---:|---:|
| Lab `127.0.0.1:4174` | loopback (throttle ignored) | 920 ms | 936 ms | 966 ms | 2 ms |
| Live Pages | this PC, cold cache | 2700 ms | 2760 ms | 3371 ms | 769 ms |

Raw JSON: `perf/bench/lab-fast4g.json`, `perf/bench/live-pages.json`.

## Deterministic counts (same every run)

| Count | Lab | Live |
|---|---:|---:|
| Requests (document + resources) | 16 | 16 |
| Bytes on the wire | 316 KB (no gzip) | 142 KB (gzip) |
| Encoded body | 321 KB | 140 KB |

`player.mjs` and `recipe.mjs` each load twice: once as `?v=22` from `main.mjs`, once unversioned from `index.mjs`.

## Live waterfall (slowest run, usable 3856 ms)

| When | What |
|---|---|
| 0–890 ms | HTML TTFB |
| 896–1725 ms | `styles.css` and `main.mjs` in parallel |
| 1744–2097 ms | `index.mjs?v=22`, `player.mjs?v=22`, `recipe.mjs?v=22` |
| 2096–2445 ms | `glyphs`, `grid`, `mount`, `composite`, and a second copy of `player` / `recipe` |
| 2445–2793 ms | `vendor/gifuct.mjs` |
| 2796–3337 ms | **VT323 font, 45 KB gzip / 153 KB raw** |
| 3340–3761 ms | **`squidward.gif` only starts after the font finishes** |
| ~3856 ms | first ASCII ink |

Default font is Consolas. The script still `await document.fonts.load('20px VT323')` before it fetches the GIF, and CSS `@font-face` pulls the same file. That is the longest optional asset on the critical path.

Locally the same order holds: font 372–712 ms, GIF 716–880 ms, usable ~940 ms. About 60–100 ms after the GIF arrives is decode + first draw.

## What this is not

- Not a 4G lab number (loopback not throttled).
- Not CrUX.
- Long-task observer often reported 0; decode may sit under the 50 ms threshold or land between observations.

## After (local, same bench, 2026-09-26)

Changes: do not wait on VT323 for the default Consolas clip; start `squidward.gif` from a blocking-free `fetch` in `<head>`; import each module once; `modulepreload` the graph.

| Location | usable p50 | usable p75 | usable p95 | Requests | Wire |
|---|---:|---:|---:|---:|---:|
| Lab before | 920 ms | 936 ms | 966 ms | 16 | 316 KB |
| Lab after | 100 ms | **104 ms** | 177 ms | 11 | 143 KB |

Local p75 **−89%**. VT323 is gone from the first load. GIF fetch starts with the document instead of after the font. `player.mjs` / `recipe.mjs` load once. Glyphs, paused default, and Squidward are unchanged; VT323 still loads when that font is selected.

Live Pages still serves the old bundle until this is pushed. Expected live win is the same critical path: font no longer gates the GIF, and the module staircase collapses.

Raw JSON: `perf/bench/lab-after.json`.
