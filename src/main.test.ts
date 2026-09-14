import { describe, expect, it } from "vite-plus/test";
import { scoreModel, type Cell } from "./main.ts";

const rankKey = (c: Cell): number[] => [-c.score, c.price, -c.utility, c.qi, c.ri];
const ordered = (a: number[], b: number[]): boolean => {
  for (const [i, v] of a.entries()) if (v !== b[i]) return v < b[i];
  return true;
};

describe("dominance", () => {
  it("marks same-price lower combos red with reason, keeps the winner green", () => {
    const m = scoreModel("m", {
      resolutions: ["1x"],
      qualities: ["a", "b"],
      matrix: { a: { "1x": 1 }, b: { "1x": 1 } },
    });
    const [a, b] = m.cells;
    expect(a.tier).toBe("red");
    expect(a.score).toBe(0);
    expect(a.reason).toBe(
      "Dominated by b @ 1x at same price (1 credits) — never pay same for less",
    );
    expect(b.tier).toBe("green");
    expect(b.score).toBeCloseTo(3.4, 9);
    expect(b.reason).toBe("base combo");
    expect(b.top).toBe(true);
    expect(m.picks.map((c) => c.q)).toEqual(["b"]);
  });
});

describe("scoring", () => {
  // low: 1k=1 2k=2 / high: 1k=2 2k=4 — nothing dominated. QUALITY_W=1.2.
  // low/1k: U=2.2 E=2.2 pen=0 → 2.2
  // low/2k: U=3.2 E=1.6 pen=0.5*((2-1)/1-0.8)=0.1 → 1.6/1.1
  // high/1k: U=3.4 E=1.7 pen=0.5*((2-1)/1-0.6)=0.2 → 1.7/1.2
  // high/2k: U=4.4 E=1.1 pen=0.5*0.2+0.5*0.4=0.3 → 1.1/1.3
  const m = scoreModel("m", {
    resolutions: ["1k", "2k"],
    qualities: ["low", "high"],
    matrix: { low: { "1k": 1, "2k": 2 }, high: { "1k": 2, "2k": 4 } },
  });
  const by = (q: string, r: string) => m.cells.find((c) => c.q === q && c.r === r)!;

  it("computes neighbor-weighted scores", () => {
    expect(by("low", "1k").score).toBeCloseTo(2.2, 9);
    expect(by("low", "2k").score).toBeCloseTo(1.6 / 1.1, 9);
    expect(by("high", "1k").score).toBeCloseTo(1.7 / 1.2, 9);
    expect(by("high", "2k").score).toBeCloseTo(1.1 / 1.3, 9);
  });

  it("tiers by score/maxScore", () => {
    expect(by("low", "1k").tier).toBe("green");
    // ponytail: fragile by design — norm 80/121 ≈ 0.661 hugs GREEN_AT 0.66.
    expect(by("low", "2k").tier).toBe("green");
    expect(by("high", "1k").tier).toBe("yellow");
    expect(by("high", "2k").tier).toBe("yellow");
  });

  it("explains picks in one line", () => {
    expect(by("low", "1k").reason).toBe(
      "next 2k +100% (steep climb); next high +100% (steep climb)",
    );
    expect(by("low", "2k").reason).toBe("+100% for 1k -> 2k; next high +100% (steep climb)");
    expect(by("high", "2k").reason).toBe("+100% for 1k -> 2k; +100% vs low");
  });

  it("ranks picks and stars green only, max 3", () => {
    expect(m.picks.map((c) => `${c.q}/${c.r}`)).toEqual(["low/1k", "low/2k", "high/1k", "high/2k"]);
    expect(m.picks.filter((c) => c.top).map((c) => `${c.q}/${c.r}`)).toEqual(["low/1k", "low/2k"]);
  });
});

describe("holes", () => {
  it("skips holes and scores lone cells as base combos", () => {
    const m = scoreModel("m", {
      resolutions: ["1x", "2x"],
      qualities: ["a", "b"],
      matrix: { a: { "1x": 1 } },
    });
    expect(m.cells).toHaveLength(1);
    expect(m.cells[0].reason).toBe("base combo");
    expect(m.cells[0].tier).toBe("green");
  });

  it("treats 0/negative/NaN/Infinity/null/missing as holes", () => {
    const m = scoreModel("m", {
      resolutions: ["r1", "r2", "r3", "r4", "r5", "r6", "r7"],
      qualities: ["a"],
      matrix: {
        a: { r1: 1, r2: 0, r3: -2, r4: NaN, r5: Infinity, r6: null as unknown as number },
      },
    });
    expect(m.cells.map((c) => c.r)).toEqual(["r1"]);
  });

  it("skips holes to the nearest valid neighbor and treats ±EPS prices as tied", () => {
    const m = scoreModel("m", {
      resolutions: ["1k", "2k", "4k"],
      qualities: ["a", "b"],
      matrix: { a: { "1k": 1, "4k": 3 }, b: { "1k": 1 + 5e-10, "2k": 2, "4k": 6 } },
    });
    const by = (q: string, r: string) => m.cells.find((c) => c.q === q && c.r === r)!;
    expect(m.cells).toHaveLength(5);
    expect(by("a", "1k").tier).toBe("red");
    expect(by("a", "1k").reason).toContain("at same price");
    expect(by("b", "1k").tier).not.toBe("red");
    expect(by("a", "4k").reason).toContain("(skipped n/a)");
    expect(by("b", "2k").reason).toContain("+100% for 1k -> 2k");
  });

  it("returns no picks when everything is a hole", () => {
    const m = scoreModel("m", { resolutions: [], qualities: [], matrix: {} });
    expect(m.cells).toEqual([]);
    expect(m.picks).toEqual([]);
  });
});

describe("invariants", () => {
  const m = scoreModel("m", {
    resolutions: ["1", "2", "3"],
    qualities: ["a", "b", "c"],
    matrix: {
      a: { "1": 1, "2": 2, "3": 4 },
      b: { "1": 1.25, "2": 2.5, "3": 5 },
      c: { "1": 2, "2": 4 },
    },
  });

  it("dominated cells are red with score 0, holes never rank", () => {
    for (const c of m.cells) {
      if (c.reason.startsWith("Dominated by")) {
        expect(c.tier).toBe("red");
        expect(c.score).toBe(0);
      }
    }
    expect(m.cells.find((c) => c.q === "c" && c.r === "3")).toBeUndefined();
    for (const c of m.picks) expect(c.score).toBeGreaterThan(0);
  });

  it("picks stay sorted and stars stay green and few", () => {
    for (let i = 1; i < m.picks.length; i++) {
      expect(ordered(rankKey(m.picks[i - 1]), rankKey(m.picks[i]))).toBe(true);
    }
    const tops = m.picks.filter((c) => c.top);
    expect(tops.length).toBeLessThanOrEqual(3);
    for (const c of tops) expect(c.tier).toBe("green");
  });
});
