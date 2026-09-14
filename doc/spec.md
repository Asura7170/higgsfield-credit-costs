# Higgsfield cost dashboard — spec

Pinned snapshot: `public/higgsfield-costs.json` @ `updatedAt 2026-09-13T18:26:13.7922587Z`.
Results always come from the formula in §4 — no pinned per-cell expectations.

## 1. Objective + Non-goals

Objective: read-only page ranking every quality × resolution combo per model by value (quality + resolution per credit).
Goals: one table per model, tier per cell (green/yellow/red), "Best combinations" list, top-pick stars.

Non-goals: no backend, no auth, no editing/refreshing data in-page (dialog only shows the command),
no filters/sorting controls, no i18n (English only), no light theme.

## 2. Constraints

- Vite+ vanilla-ts, Chrome latest only, no fallbacks/polyfills. Zero runtime dependencies.
- TS: `erasableSyntaxOnly` + `verbatimModuleSyntax` — string-literal unions + `as const`, no enum/namespaces/parameter properties. `noUnusedLocals`/`noUnusedParameters` on.
- `vite.config.ts` MUST contain `server: { open: true }` (additive change, only allowed touch).
- DO NOT TOUCH otherwise: `scripts/`, `public/higgsfield-costs.json`, `package.json`, `tsconfig.json`.
- Fonts: Google Fonts Inter + Space Grotesk with `display=swap`, `system-ui` fallback.
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

- `index.html`: semantic, one `h1` "Higgsfield cost dashboard"; `header` with `p#updated` + `button#how-open` "How to update"; `main#app` (TS-rendered sections per model: `h2` `<id> — N combos`, `table` qualities=rows `scope="row"` / resolutions=cols `scope="col"` inside `.table-wrap`, `h3` "Best combinations", `ol` of picks); `section` legend (green/yellow/red swatches + "★ top pick (up to 3 per table)"); `p#method`; `dialog#how-dialog` with `closedby="any"` showing the refresh command.
- Fetch failure / malformed JSON → `p#updated` shows error, `main#app` shows one `p` error message, no tables.

## 6. Style contract

Tokens live in `DESIGN.md`; `src/style.css` references them, no duplicates.
Key rules: `.table-wrap { overflow-x: auto }` (tables scroll at 375px, page never overflows);
`td.tier-green/yellow/red` backgrounds; `td.tier-red::before` `"! "` red; `td.top::after` `" ★"` lime;
44px buttons, `:focus-visible` lime, `prefers-reduced-motion` kills animation.

## 7. Edge cases

- Single-quality model (`nano_banana_pro`): vertical neighbors absent → no quality excess terms.
- Single cell / all holes: no scores → list shows `No green or yellow combos.`
- Same-price twins: tiers are pure score/maxScore, no cap — a higher-`qi` twin at the same price dominates, so the lower one ranks red.
- `4k` boundary (`nano_banana_pro` at snapshot): red or yellow, never green — data observation, not a formula guarantee.
- Float prices: all price comparisons use `±EPS`.

## 8. File map + Verify

- `index.html` (shell) → `src/main.ts` (fetch + algorithm + render) → `src/style.css` (tokens from `DESIGN.md`). New: `DESIGN.md` (tokens only).
- Verify: `vp check`, `vp build` (`tsc`), `vp test` clean; Chrome 375px (tables scroll, page not) + 1280px; keyboard reaches button/dialog/table; dialog closes via `closedby`; reduced-motion kills animation.
