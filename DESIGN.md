# DESIGN.md — Higgsfield cost dashboard tokens

Dark-only neon-minimalist. Single source of truth for color/surface/radius; `src/style.css` references these, no duplicates.

```css
:root {
  color-scheme: dark;
  --bg: linear-gradient(#0f1113, #030304);
  --surface: #1a1a1a;
  --text: #ffffff;
  --muted: #929292;
  --border: rgba(255, 255, 255, 0.08);
  --radius: 12px;
  --lime: #d1fe17;
  --on-lime: #1a1a1a;
  --green: #22c55e;
  --yellow: #eab308;
  --red: #ef4444;
  --font-body: "Inter", system-ui, sans-serif;
  --font-display: "Space Grotesk", system-ui, sans-serif;
}
```
