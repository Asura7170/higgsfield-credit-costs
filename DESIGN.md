# DESIGN.md — Higgsfield cost dashboard tokens

Dark + light, neon-minimalist, Higgsfield brand. Single source of truth; `src/style.css`
references these tokens, no duplicates. One accent (lime), one radius, theme follows the OS.

```css
:root {
  color-scheme: light dark;

  /* Primitives (brand) */
  --woodsmoke: #0f1113;
  --lime: #d1fe17;
  --ink: #1a1a1a;
  --paper: #f2f4ec;

  /* Semantic */
  --bg: light-dark(#f7f8f5, linear-gradient(#0f1113, #030304));
  --surface: light-dark(#ffffff, #1a1a1a);
  --text: light-dark(#17191d, var(--paper));
  --muted: light-dark(#5b636a, #929292);
  --border: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.08));
  --brand: var(--lime);
  --brand-deep: #1a2e05;
  --on-brand: var(--ink);
  --focus: light-dark(#3f6212, var(--lime));
  --tier-high: #22c55e;
  --tier-mid: #eab308;
  --tier-low: #ef4444;

  /* Shape, type, motion */
  --radius: 12px;
  --cta-shadow: light-dark(0 1px 2px rgba(0, 0, 0, 0.12), 0 0 1.5rem rgba(209, 254, 23, 0.25));
  --edge-highlight: light-dark(rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.06));
  --ease-out: cubic-bezier(0.32, 0.72, 0, 1);
  --font-body: "Plus Jakarta Sans", system-ui, sans-serif;
  --font-display: "Space Grotesk", system-ui, sans-serif;
}
```

## Rules

- **Color lock:** lime is the only decorative accent (`--brand-deep` forest green carries it on light surfaces, where pure lime fails contrast). Tier colors are data status only, never decoration.
- **Shape lock:** `--radius` for surfaces, pills for buttons.
- **Data figures:** `font-variant-numeric: tabular-nums` on all tables and prices.
- **Prose measure:** max `65ch` for paragraphs.
- **Focus:** 2px `var(--focus)` outline with 2px offset, always visible.
- **Motion:** `var(--ease-out)` everywhere, `transform`/`opacity` only; sections `.reveal` fade up via `IntersectionObserver`; `prefers-reduced-motion` kills everything.
- **Contrast:** AA everywhere, both themes — CTA is lime on near-black, tiers are 22% tints behind `--text`.
- **Theme:** header `#theme-toggle` is a circular 44px surface button with a lime sun/moon icon (shows the target mode); it flips `html[data-theme]` (persisted in `localStorage`); unset = OS decides via `color-scheme`. No per-section inversion.
