# Higgsfield cost dashboard — spec

Pinned snapshot: `public/higgsfield-costs.json` @ `updatedAt 2026-09-13T18:26:13.7922587Z`.
Results always come from the formula in §4 — no pinned per-cell expectations.

## 1. Objective + Non-goals

Objective: read-only page ranking every quality × resolution combo per model by value (quality + resolution per credit).
Goals: one table per model, tier per cell (green/yellow/red), "Best combinations" list, top-pick stars.

Non-goals: no backend, no auth, no editing/refreshing data in-page (dialog only shows the command),
no filters/sorting controls, no i18n (English only). Light + dark themes follow the OS.

## 2. Constraints

- Vite+ vanilla-ts, Chrome latest only, no fallbacks/polyfills. Zero runtime dependencies.
- TS: `erasableSyntaxOnly` + `verbatimModuleSyntax` — string-literal unions + `as const`, no enum/namespaces/parameter properties. `noUnusedLocals`/`noUnusedParameters` on.
- `vite.config.ts` MUST contain `server: { open: true }` (additive change, only allowed touch).
- DO NOT TOUCH otherwise: `scripts/`, `public/higgsfield-costs.json`, `package.json`, `tsconfig.json`.
- Fonts: Google Fonts Plus Jakarta Sans + Space Grotesk with `display=swap`, `system-ui` fallback.
- `script type="module"` in `index.html`.

## 3. Data contract

Input: `public/higgsfield-costs.json`:

```json
{ "updatedAt": "ISO", "aspect_ratio": "1:1",
  "models": { "<id>": { "resolutions": ["1k", ...], "qualities": ["low", ...],
  "matrix": { "<quality>": { "<res>": credits } } } } }
```

Snapshot enums: `gpt_image_2_5` [1k,2k,4k]×[low,medium,high,xhigh,max];
`grok_image` [1k,2k]×[standard,quality]; `grok_image_2_0` [1k,2k]×[low,medium];
`nano_banana_pro` [1k,2k,4k]×[default]. Credits may be floats (1.25, 1.5, 2.5).
Ordinal indices `qi`/`ri` = position in JSON arrays (0-based).
Hole = null/missing/`<= 0`/non-finite → skipped everywhere, never scored.

## 4. Algorithm (per model)

Consts: `QUALITY_W=1.2, T_RES=0.8, T_QUAL=0.6, W_RIGHT=1.0, W_DOWN=1.0, W_LEFT=0.5, W_UP=0.5, GREEN_AT=0.66, YELLOW_AT=0.33, STARS_MAX=3, EPS=1e-9`.

Phase A (Pareto): A dominates B if `A.qi>=B.qi && A.ri>=B.ri && A.p<=B.p+EPS` with one strict inequality → B red, score 0, reason `Dominated by {q} @ {r} at same price ({p} credits) — never pay same for less`, or `: more for less ({p} credits)` if `A.p<B.p-EPS`.

Phase B (score, non-dominated only): `U=QUALITY_W*(qi+1)+1.0*(ri+1)` with `QUALITY_W=1.2` (quality weighs slightly more); `E=U/credits`.
Nearest valid neighbor in all 4 dirs (skip holes). `excess=max(0,(p-n)/n-T)` per direction (T per axis above); `score=E/(1+0.5*exL+0.5*exU+1.0*exR+1.0*exD)`.
Reasons (EN): incoming `+{n}% for {prevR} -> {r}` / `+{n}% vs {prevQ}` (+ ` (skipped n/a)` if gap>1); outgoing `next {label} +{n}% (cheap upgrade|steep climb)`; none → `base combo`.

Phase C (tiers): `maxScore` over non-dominated (score>0) → green `≥0.66`, yellow `≥0.33`, else red.

Picks = all green+yellow sorted by score desc, credits asc, utility desc, `qi`, `ri`.
Stars (`class="top"`) = first ≤3 GREEN picks per table (0 greens → 0 stars).

## 5. DOM contract

- `index.html`: semantic, one `h1` "Higgsfield cost dashboard" (skip-link to `#app` first in `body`); `head` with favicon, OG tags, per-theme `theme-color`; `header` with two flex rows: `.hero-top` (`h1` + `button#theme-toggle` sun/moon icon, flips `html[data-theme]`, persisted) and `.hero-sub` (`button#how-open` "How to update" with `commandfor="how-popover" command="toggle-popover"` + `p > time#updated`); `main#app` is a bento grid (`1col <700px, 2col above` — every tile takes half the row; no `dense` so DOM order = reading order) of TS-rendered `section.model` tiles per model: uppercase `h2` with the model display name (`gpt_image_2_5` → "GPT Image 2.5", unknown ids fall back to the id with `_` as spaces), `table` qualities=rows `scope="row"` / resolutions=cols `scope="col"` inside `.table-wrap`, `h3` "Best combinations" + ranked `ol.picks` of top picks (rank, combo, tabular price, ★, one-line plain verdict, raw reason in `title`) + `<details name="more-picks">` with the remaining picks (one shared name document-wide, so opening one closes the others); the static legend `section` + `p#method` stay below `#app` as page footer info; `div#how-popover popover="auto" closedby="any"` showing the refresh command in a `.cmd-bar` (`role="group"`) with `#copy-cmd` — Clipboard API copy with select-for-manual-copy fallback, feedback in `aria-live` `<output>.copy-note`.
- Fetch failure / malformed JSON → `p#updated` shows error, `main#app` shows one `p` error message, no tables.
- Jump labels: each data cell appends `span.jump-r` (`+X% →` vs nearest-valid left neighbor) / `span.jump-d` (`+Y% ↓` vs nearest-valid upper), both `aria-hidden`; rendered for any existing neighbor including `= 0%`, none when base; `td` carries `aria-label` "`<price>` credits, `<best|fair|poor>` value[, top pick][, jumps|, base]" and `title` = reason (incoming steps only when `price > neighbor + EPS`, so `= 0%` has no incoming reason).

## 6. Style contract

Tokens live in `DESIGN.md`; `src/style.css` references them, no duplicates.
Key rules: `.table-wrap { overflow-x: auto }` (tables scroll at 375px, page never overflows);
`td.tier-green/yellow/red` backgrounds via `@function --tint`; `td.tier-red::before` `"! "` red; `td.top::after` `" ★"` lime;
44px buttons, `:focus-visible` lime, `prefers-reduced-motion` kills animation.
`.reveal` sections fade up via scroll-driven `animation-timeline: view()` (no JS, no noscript); pick stagger uses `sibling-index()`;
`.more-picks::details-content` animates open/close via `calc-size()`; `#copy-cmd` sticks right inside `.cmd-bar` while the command scrolls.
Tables use `separate` + `spacing: 0` 1px grid (first body row drops its top border so the thead junction stays 1px); `td` and `thead th` centered; jump labels are frosted pills (translucent surface + `blur(3px)`, radius `99px`), hover/active `scale: 1.25`.
Bento: `#app { display: grid; gap: 1rem }`, `.model` tiles reuse surface/border/`--radius`/`edge-highlight` with `container-type: inline-size` (cell padding compacts under `26rem`); `align-items: start` so short tiles don't stretch.

## 7. Edge cases

- Single-quality model (`nano_banana_pro`): vertical neighbors absent → no quality excess terms.
- Single cell / all holes: no scores → list shows `No green or yellow combos.`
- Same-price twins: tiers are pure score/maxScore, no cap — a higher-`qi` twin at the same price dominates, so the lower one ranks red.
- `4k` boundary (`nano_banana_pro` at snapshot): red or yellow, never green — data observation, not a formula guarantee.
- Float prices: all price comparisons use `±EPS`.
- Jump labels use the nearest valid neighbor (holes skipped silently in the visual; `title` notes `(skipped n/a)`); `= 0%` renders deliberately; a price inversion would render `-X%` (snapshot data is monotonic).
- Known bounded inconsistency: a nonzero jump below 0.5% would round to `= 0%` in the label while its reason shows `+0%` (snapshot min nonzero jump is 25%, so no current impact).

## 8. File map + Verify

- `index.html` (shell) → `src/main.ts` (fetch + algorithm + render) → `src/style.css` (tokens from `DESIGN.md`). New: `DESIGN.md` (tokens only). Reference: `doc/CSS_2024-2026.md` + `doc/html_2024-2026.md` (Chrome feature cheatsheets).
- Verify: `vp check`, `vp build` (`tsc`), `vp test` clean; Chrome 375px (bento 1 col, tables scroll inside tiles, page not) + 768px (2 col) + 1280px (3 col, wide tile spans 2), light + dark; keyboard reaches button/popover/table; popover closes via `closedby` (ESC / click outside / `request-close`); reduced-motion kills animation.
