import { describe, it, expect } from "vitest";
import { NAME_POOL, pickName } from "../../../src/names/generator.js";

describe("NameGenerator", () => {
  it("pool has 26 distinct names starting with distinct letters", () => {
    expect(NAME_POOL.length).toBe(26);
    expect(new Set(NAME_POOL).size).toBe(26);
    expect(new Set(NAME_POOL.map((n) => n[0])).size).toBe(26);
  });

  it("returns first pool name when nothing is taken", () => {
    expect(pickName([])).toBe("Alice");
  });

  it("skips taken names", () => {
    expect(pickName(["Alice", "Bob"])).toBe("Carol");
  });

  it("suffixes when every pool name is taken", () => {
    const taken = [...NAME_POOL];
    expect(pickName(taken)).toBe("Alice2");
  });

  it("increments suffix when NameN is taken", () => {
    const taken = [...NAME_POOL, "Alice2"];
    expect(pickName(taken)).toBe("Bob2");
  });

  it("handles deeply saturated pools deterministically", () => {
    const taken = [...NAME_POOL, ...NAME_POOL.map((n) => `${n}2`)];
    expect(pickName(taken)).toBe("Alice3");
  });
});
