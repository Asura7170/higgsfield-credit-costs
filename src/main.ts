import "./style.css";

const EPS = 1e-9;
const QUALITY_W = 1.2;
const T_RES = 0.8;
const T_QUAL = 0.6;
const W_RIGHT = 1.0;
const W_DOWN = 1.0;
const W_LEFT = 0.5;
const W_UP = 0.5;
const GREEN_AT = 0.66;
const YELLOW_AT = 0.33;
const STARS_MAX = 3;

const MODEL_NAMES: Record<string, string> = {
  gpt_image_2_5: "GPT Image 2.5",
  grok_image: "Grok Image",
  grok_image_2_0: "Grok Image 2.0",
  nano_banana_pro: "Nano Banana Pro",
};

export function displayName(id: string): string {
  return MODEL_NAMES[id] ?? id.replaceAll("_", " ");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Tier = "green" | "yellow" | "red";

interface CostFile {
  updatedAt: string;
  models: Record<string, CostModel>;
}

interface CostModel {
  resolutions: string[];
  qualities: string[];
  matrix: Record<string, Record<string, number>>;
}

export interface Cell {
  q: string;
  r: string;
  qi: number;
  ri: number;
  price: number;
  utility: number;
  score: number;
  tier: Tier;
  reason: string;
  top: boolean;
}

export interface ModelResult {
  id: string;
  qualities: string[];
  resolutions: string[];
  cells: Cell[];
  picks: Cell[];
}

function isHole(price: unknown): boolean {
  return typeof price !== "number" || !Number.isFinite(price) || price <= 0;
}

function excess(price: number, neighbor: number | undefined, threshold: number): number {
  if (neighbor === undefined) return 0;
  return Math.max(0, (price - neighbor) / neighbor - threshold);
}

function jumpPct(from: number, to: number): number {
  return Math.round(((to - from) / from) * 100);
}

// ponytail: nearest-valid scan duplicated from scoreModel; n<=15 so no index needed.
function deltasFor(m: ModelResult, c: Cell): { left: Cell | undefined; up: Cell | undefined } {
  const byPos = (qi: number, ri: number): Cell | undefined =>
    m.cells.find((x) => x.qi === qi && x.ri === ri);
  let left: Cell | undefined;
  for (let r = c.ri - 1; r >= 0; r--) {
    const found = byPos(c.qi, r);
    if (found) {
      left = found;
      break;
    }
  }
  let up: Cell | undefined;
  for (let q = c.qi - 1; q >= 0; q--) {
    const found = byPos(q, c.ri);
    if (found) {
      up = found;
      break;
    }
  }
  return { left, up };
}

function fmtJump(pct: number): string {
  return pct > 0 ? `+${pct}%` : pct === 0 ? "= 0%" : `${pct}%`;
}

interface Neighbors {
  left: Cell | undefined;
  right: Cell | undefined;
  up: Cell | undefined;
  down: Cell | undefined;
}

function explain(c: Cell, nb: Neighbors): string {
  const parts: string[] = [];
  if (nb.left && c.price > nb.left.price + EPS) {
    parts.push(
      `+${jumpPct(nb.left.price, c.price)}% for ${nb.left.r} -> ${c.r}${nb.left.ri < c.ri - 1 ? " (skipped n/a)" : ""}`,
    );
  }
  if (nb.up && c.price > nb.up.price + EPS) {
    parts.push(
      `+${jumpPct(nb.up.price, c.price)}% vs ${nb.up.q}${nb.up.qi < c.qi - 1 ? " (skipped n/a)" : ""}`,
    );
  }
  if (nb.right && nb.right.price > c.price + EPS) {
    const jump = (nb.right.price - c.price) / c.price;
    parts.push(
      `next ${nb.right.r} +${jumpPct(c.price, nb.right.price)}% (${jump <= T_RES ? "cheap upgrade" : "steep climb"})`,
    );
  }
  if (nb.down && nb.down.price > c.price + EPS) {
    const jump = (nb.down.price - c.price) / c.price;
    parts.push(
      `next ${nb.down.q} +${jumpPct(c.price, nb.down.price)}% (${jump <= T_QUAL ? "cheap upgrade" : "steep climb"})`,
    );
  }
  return parts.length > 0 ? parts.join("; ") : "base combo";
}

export function scoreModel(id: string, model: CostModel): ModelResult {
  const cells: Cell[] = [];
  for (const [qi, q] of model.qualities.entries()) {
    for (const [ri, r] of model.resolutions.entries()) {
      const price = model.matrix[q]?.[r];
      if (isHole(price)) continue;
      cells.push({
        q,
        r,
        qi,
        ri,
        price: price as number,
        utility: QUALITY_W * (qi + 1) + (ri + 1),
        score: 0,
        tier: "red",
        reason: "",
        top: false,
      });
    }
  }
  // ponytail: linear scan, n<=15 so O(n^2) dominance + O(n) lookup is trivial.
  const nearest = (qi: number, ri: number, dqi: number, dri: number): Cell | undefined => {
    let q = qi + dqi;
    let r = ri + dri;
    while (q >= 0 && q < model.qualities.length && r >= 0 && r < model.resolutions.length) {
      const found = cells.find((c) => c.qi === q && c.ri === r);
      if (found) return found;
      q += dqi;
      r += dri;
    }
    return undefined;
  };

  for (const b of cells) {
    const dom = cells.find(
      (a) =>
        a !== b &&
        a.qi >= b.qi &&
        a.ri >= b.ri &&
        a.price <= b.price + EPS &&
        (a.qi > b.qi || a.ri > b.ri || a.price < b.price - EPS),
    );
    if (dom) {
      b.reason =
        Math.abs(dom.price - b.price) <= EPS
          ? `Dominated by ${dom.q} @ ${dom.r} at same price (${b.price} credits) — never pay same for less`
          : `Dominated by ${dom.q} @ ${dom.r}: more for less (${b.price} credits)`;
    }
  }

  for (const c of cells) {
    if (c.reason) continue;
    const nb: Neighbors = {
      left: nearest(c.qi, c.ri, 0, -1),
      right: nearest(c.qi, c.ri, 0, 1),
      up: nearest(c.qi, c.ri, -1, 0),
      down: nearest(c.qi, c.ri, 1, 0),
    };
    const penalty =
      W_LEFT * excess(c.price, nb.left?.price, T_RES) +
      W_UP * excess(c.price, nb.up?.price, T_QUAL) +
      W_RIGHT * excess(c.price, nb.right?.price, T_RES) +
      W_DOWN * excess(c.price, nb.down?.price, T_QUAL);
    c.score = c.utility / c.price / (1 + penalty);
    c.reason = explain(c, nb);
  }

  const maxScore = Math.max(0, ...cells.map((c) => c.score));
  for (const c of cells.filter((c) => c.score > 0)) {
    const norm = maxScore > 0 ? c.score / maxScore : 0;
    c.tier = norm >= GREEN_AT ? "green" : norm >= YELLOW_AT ? "yellow" : "red";
  }

  const picks = cells
    .filter((c) => c.tier === "green" || c.tier === "yellow")
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.price - b.price ||
        b.utility - a.utility ||
        a.qi - b.qi ||
        a.ri - b.ri,
    );
  for (const c of picks.filter((c) => c.tier === "green").slice(0, STARS_MAX)) c.top = true;
  return { id, qualities: model.qualities, resolutions: model.resolutions, cells, picks };
}

export function verdict(reason: string): string {
  if (reason === "base combo") return "The baseline — no pricier neighbor.";
  const step = reason.match(/\+(\d+)% for (\S+) -> ([^;]+)/);
  if (step) return `Pays +${step[1]}% stepping ${step[2]} → ${step[3].trim()}.`;
  const versus = reason.match(/\+(\d+)% vs ([^;(]+)/);
  if (versus) return `Pays +${versus[1]}% over ${versus[2].trim()} quality.`;
  const next = reason.match(/next (\S+) \+(\d+)% \((cheap upgrade|steep climb)\)/);
  if (next) {
    return `Next step ${next[1]} costs +${next[2]}% — ${next[3] === "cheap upgrade" ? "worth it" : "pricey"}.`;
  }
  return reason;
}

export function splitPicks(picks: Cell[]): { shown: Cell[]; hidden: Cell[] } {
  const tops = picks.filter((c) => c.top);
  return tops.length > 0
    ? { shown: tops, hidden: picks.filter((c) => !c.top) }
    : { shown: picks.slice(0, 1), hidden: picks.slice(1) };
}

function pickItem(c: Cell, rank: number): HTMLElement {
  const li = document.createElement("li");
  li.className = `pick tier-${c.tier}${c.top ? " top" : ""}`;
  li.title = c.reason;
  const line = document.createElement("p");
  line.className = "pick-line";
  const rankEl = document.createElement("span");
  rankEl.className = "pick-rank";
  rankEl.setAttribute("aria-hidden", "true");
  rankEl.textContent = `${rank}`;
  const combo = document.createElement("strong");
  combo.textContent = `${cap(c.q)} - ${c.r}`;
  line.append(rankEl, combo);
  if (c.top) {
    const star = document.createElement("span");
    star.className = "star";
    star.setAttribute("role", "img");
    star.setAttribute("aria-label", "top pick");
    star.textContent = "★";
    line.append(star);
  }
  const price = document.createElement("span");
  price.className = "pick-price";
  price.textContent = `${c.price} credits`;
  const say = document.createElement("p");
  say.className = "pick-verdict";
  say.textContent = verdict(c.reason);
  const main = document.createElement("div");
  main.className = "pick-main";
  main.append(line, say);
  li.append(main, price);
  return li;
}

function renderModel(m: ModelResult): HTMLElement {
  const section = document.createElement("section");
  // ponytail: widest matrix spans 2 bento cols; threshold 8 fits only GPT (15).
  section.className = `reveal model${m.cells.length > 8 ? " model-wide" : ""}`;
  const h2 = document.createElement("h2");
  h2.textContent = displayName(m.id);
  section.append(h2);

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", `${displayName(m.id)} costs`);
  const table = document.createElement("table");
  const head = document.createElement("tr");
  head.append(document.createElement("th"));
  for (const r of m.resolutions) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = r;
    head.append(th);
  }
  const thead = document.createElement("thead");
  thead.append(head);
  table.append(thead);
  const tbody = document.createElement("tbody");
  for (const q of m.qualities) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = cap(q);
    tr.append(th);
    for (const r of m.resolutions) {
      const td = document.createElement("td");
      const cell = m.cells.find((c) => c.q === q && c.r === r);
      if (cell) {
        const { left, up } = deltasFor(m, cell);
        td.textContent = `${cell.price}`;
        const jumps: string[] = [];
        for (const [label, cls] of [
          [left && `${fmtJump(jumpPct(left.price, cell.price))} →`, "jump-r"],
          [up && `${fmtJump(jumpPct(up.price, cell.price))} ↓`, "jump-d"],
        ] as const) {
          if (!label) continue;
          jumps.push(label);
          const edge = document.createElement("span");
          edge.className = cls;
          edge.setAttribute("aria-hidden", "true");
          edge.textContent = label;
          td.append(edge);
        }
        td.className = `tier-${cell.tier}${cell.top ? " top" : ""}`;
        td.title = cell.reason;
        const tierWord =
          cell.tier === "green"
            ? "best value"
            : cell.tier === "yellow"
              ? "fair value"
              : "poor value";
        td.setAttribute(
          "aria-label",
          `${cell.price} credits, ${tierWord}${cell.top ? ", top pick" : ""}${jumps.length > 0 ? `, ${jumps.join(", ")}` : ", base"}`,
        );
      } else {
        td.textContent = "n/a";
      }
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  section.append(wrap);

  const h3 = document.createElement("h3");
  h3.textContent = "Best combinations";
  section.append(h3);
  if (m.picks.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No green or yellow combos.";
    section.append(p);
    return section;
  }
  const { shown, hidden } = splitPicks(m.picks);
  const ol = document.createElement("ol");
  ol.className = "picks";
  shown.forEach((c, i) => ol.append(pickItem(c, i + 1)));
  section.append(ol);
  if (hidden.length > 0) {
    const det = document.createElement("details");
    det.className = "more-picks";
    det.name = "more-picks";
    const sum = document.createElement("summary");
    const moreLabel = `Show ${hidden.length} more combination${hidden.length === 1 ? "" : "s"}`;
    sum.textContent = moreLabel;
    det.addEventListener("toggle", () => {
      sum.textContent = det.open ? "Show fewer combinations" : moreLabel;
    });
    const restOl = document.createElement("ol");
    restOl.className = "picks";
    restOl.start = shown.length + 1;
    hidden.forEach((c, i) => restOl.append(pickItem(c, shown.length + i + 1)));
    det.append(sum, restOl);
    section.append(det);
  }
  return section;
}

function render(results: ModelResult[]): void {
  const app = document.querySelector("#app");
  if (!app) return;
  // ponytail: fill-4 covers the pinned 4-model snapshot; other counts stay sparse.
  app.classList.toggle("fill-4", results.length === 4);
  app.replaceChildren(...results.map(renderModel));
}

function initCopyButton(): void {
  const btn = document.querySelector("#copy-cmd");
  const code = document.querySelector("#refresh-cmd");
  const note = document.querySelector(".copy-note");
  if (!(btn instanceof HTMLButtonElement) || !code || !note) return;
  const selectForManualCopy = (): void => {
    const range = document.createRange();
    range.selectNodeContents(code);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };
  btn.addEventListener("click", () => {
    const done = (): void => {
      btn.textContent = "Copied ✓";
      note.textContent = "Command copied to clipboard.";
      window.setTimeout(() => {
        btn.textContent = "Copy";
      }, 2000);
    };
    const fallback = (): void => {
      selectForManualCopy();
      note.textContent = "Copy unavailable — command selected, press Ctrl+C.";
    };
    if (!navigator.clipboard) {
      fallback();
      return;
    }
    navigator.clipboard.writeText(code.textContent ?? "").then(done, fallback);
  });
}

function fail(message: string): void {
  const updated = document.querySelector("time#updated");
  if (updated) updated.textContent = "Could not load cost data.";
  const app = document.querySelector("#app");
  if (!app) return;
  const p = document.createElement("p");
  p.textContent = message;
  app.replaceChildren(p);
}

const THEME_KEY = "higgsfield-theme";

function systemTheme(): string {
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function paintThemeButton(): void {
  const btn = document.querySelector("#theme-toggle");
  if (btn) {
    btn.setAttribute(
      "aria-pressed",
      String((document.documentElement.dataset.theme ?? systemTheme()) === "dark"),
    );
  }
}

function initTheme(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
    // ponytail: private-mode storage throws; system theme is the fallback.
  } catch {
    stored = null;
  }
  if (stored === "light" || stored === "dark") document.documentElement.dataset.theme = stored;
  paintThemeButton();
  document.querySelector("#theme-toggle")?.addEventListener("click", () => {
    const next =
      (document.documentElement.dataset.theme ?? systemTheme()) === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ponytail: theme still flips for the session without persistence.
    }
    document.documentElement.dataset.theme = next;
    paintThemeButton();
  });
}

async function boot(): Promise<void> {
  try {
    const res = await fetch("higgsfield-costs.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as CostFile;
    render(Object.entries(data.models).map(([id, m]) => scoreModel(id, m)));
    const updated = document.querySelector("time#updated");
    if (updated instanceof HTMLTimeElement) {
      updated.dateTime = data.updatedAt;
      updated.textContent = `Updated ${data.updatedAt}`;
    }
  } catch (err) {
    fail(`Could not load cost data. ${err instanceof Error ? err.message : ""}`.trim());
  }
}

if (typeof document !== "undefined") {
  initTheme();
  initCopyButton();
  void boot();
}
