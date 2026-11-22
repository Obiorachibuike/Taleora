import { describe, it, expect } from "vitest";
import { heuristicExtract } from "@/lib/memory";

describe("memory heuristic extraction", () => {
  it("extracts events/timeline/facts from content", () => {
    const content = [
      "Elias crossed the mountain pass with Ana on a cold November morning.",
      "The treasury was guarded by the dragon.",
      "Ana refused to fire her rifle until they reached the village.",
      "The morning broke over the river valley.",
    ].join(" ");
    const ex = heuristicExtract(content, 0);
    // events/timeline/facts are heuristic — must not be fabricated but must be coherent
    expect(ex.events.length + ex.facts.length).toBeGreaterThan(0);
    expect(ex.timeline.length).toBeGreaterThan(0);
    expect(ex.facts.every((f) => f.fact.length > 0)).toBe(true);
    expect(ex.events.every((e) => e.summary.length > 0)).toBe(true);
  });

  it("never invents facts on empty input", () => {
    const ex = heuristicExtract("", 1);
    expect(ex.facts).toEqual([]);
    expect(ex.events).toEqual([]);
    expect(ex.timeline).toEqual([]);
  });

  it("respects the ≤20-fact cap", () => {
    const repeated = "The dragon sleeps. The tower falls. The river shifts. ".repeat(20);
    const ex = heuristicExtract(repeated, 2);
    expect(ex.facts.length).toBeLessThanOrEqual(20);
  });
});
