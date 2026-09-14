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

function renderModel(m: ModelResult): HTMLElement {
  const section = document.createElement("section");
  const h2 = document.createElement("h2");
  h2.textContent = `${m.id} — ${m.cells.length} combos`;
  section.append(h2);

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
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
    th.textContent = q;
    tr.append(th);
    for (const r of m.resolutions) {
      const td = document.createElement("td");
      const cell = m.cells.find((c) => c.q === q && c.r === r);
      if (cell) {
        td.textContent = `${cell.price}`;
        td.className = `tier-${cell.tier}${cell.top ? " top" : ""}`;
        td.title = cell.reason;
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
  const ol = document.createElement("ol");
  if (m.picks.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No green or yellow combos.";
    ol.append(li);
  }
  for (const c of m.picks) {
    const li = document.createElement("li");
    li.textContent = `${c.q} @ ${c.r} — ${c.price} credits — ${c.reason}`;
    ol.append(li);
  }
  section.append(ol);
  return section;
}

function render(results: ModelResult[]): void {
  const app = document.querySelector("#app");
  if (!app) return;
  app.replaceChildren(...results.map(renderModel));
}

function fail(message: string): void {
  const updated = document.querySelector("#updated");
  if (updated) updated.textContent = "Could not load cost data.";
  const app = document.querySelector("#app");
  if (!app) return;
  const p = document.createElement("p");
  p.textContent = message;
  app.replaceChildren(p);
}

async function boot(): Promise<void> {
  try {
    const res = await fetch("higgsfield-costs.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as CostFile;
    render(Object.entries(data.models).map(([id, m]) => scoreModel(id, m)));
    const updated = document.querySelector("#updated");
    if (updated) updated.textContent = `Updated ${data.updatedAt}`;
  } catch (err) {
    fail(`Could not load cost data. ${err instanceof Error ? err.message : ""}`.trim());
  }
}

if (typeof document !== "undefined") void boot();
