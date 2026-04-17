import { describe, it, expect } from "vitest";
import { NAME_POOL, pickName } from "../../../src/names/generator.js";

describe("NameGenerator", () => {
  it("pool has distinct names", () => {
    expect(NAME_POOL.length).toBeGreaterThanOrEqual(26);
    expect(new Set(NAME_POOL).size).toBe(NAME_POOL.length);
  });

  it("returns the first pool name when nothing is taken and no seed", () => {
    expect(pickName([])).toBe("Alice");
  });

  it("skips taken names", () => {
    expect(pickName(["Alice"])).toBe(NAME_POOL[1]);
  });

  it("suffixes when every pool name is taken", () => {
    expect(pickName([...NAME_POOL])).toBe("Alice2");
  });

  it("increments suffix when NameN is taken", () => {
    expect(pickName([...NAME_POOL, "Alice2"])).toBe(`${NAME_POOL[1]}2`);
  });

  it("prefer reclaims a requested name when free", () => {
    expect(pickName([], { prefer: "Zara" })).toBe("Zara");
  });

  it("prefer falls back to normal pick when the preferred name is taken", () => {
    expect(pickName(["Zara"], { prefer: "Zara" })).toBe("Alice");
  });

  it("seed shuffles the pool deterministically", () => {
    const first = pickName([], { seed: "session-abc" });
    const again = pickName([], { seed: "session-abc" });
    expect(first).toBe(again);
  });

  it("different seeds produce different first picks (usually)", () => {
    const picks = new Set<string>();
    for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      picks.add(pickName([], { seed }));
    }
    // At least three distinct openers across eight seeds — proves non-trivial variance.
    expect(picks.size).toBeGreaterThanOrEqual(3);
  });

  it("seeded pick still skips taken names", () => {
    const first = pickName([], { seed: "s1" });
    expect(pickName([first], { seed: "s1" })).not.toBe(first);
  });
});
