import { describe, it, expect } from "vitest";
import { parseSkill, composeInstructions } from "../../src/mcp/skill-loader.js";

const SAMPLE = `# ChitterChatter Agent Skill
Intro line.

## On connect
Call identify.

## After every turn
Call inbox_peek.

## Completion
Post summary, then leave.
`;

describe("skill-loader", () => {
  it("splits H2 sections", () => {
    const parsed = parseSkill(SAMPLE);
    expect(Object.keys(parsed.sections)).toEqual([
      "On connect",
      "After every turn",
      "Completion",
    ]);
    expect(parsed.sections["On connect"]).toMatch(/Call identify/);
    expect(parsed.preamble).toMatch(/Intro line/);
  });

  it("composeInstructions produces a short block", () => {
    const parsed = parseSkill(SAMPLE);
    const out = composeInstructions(parsed);
    expect(out.length).toBeLessThan(2000);
    expect(out).toMatch(/On connect/);
  });
});
