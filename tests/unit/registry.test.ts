import { describe, it, expect } from "vitest";
import { KNOWN_MODEL_DEFAULTS, knownDefaultsFor, validateTaskAssignment } from "@/lib/ai/registry";

describe("AI model registry", () => {
  it("has Agnes defaults with capability sets", () => {
    expect(KNOWN_MODEL_DEFAULTS["agnes-3.0-flash"]).toBeTruthy();
    expect(KNOWN_MODEL_DEFAULTS["agnes-2.5-flash"]).toBeTruthy();
    expect(KNOWN_MODEL_DEFAULTS["agnes-2.0-flash"]).toBeTruthy();
    const defaults = knownDefaultsFor("agnes-2.5-flash");
    expect(defaults).toBeTruthy();
    expect(defaults!.tasks.length).toBeGreaterThan(0);
    expect(defaults!.supportsStreaming).toBe(true);
  });

  it("returns null for unknown models", () => {
    expect(knownDefaultsFor("nonexistent-model-xyz")).toBeNull();
  });

  it("validateTaskAssignment throws when task unsupported", () => {
    expect(() => validateTaskAssignment(["STORY_GENERATION"], ["HUMANIZATION"], "STORY_GENERATION")).toThrow();
    expect(() => validateTaskAssignment(["STORY_GENERATION", "HUMANIZATION"], ["STORY_GENERATION"], "STORY_GENERATION")).not.toThrow();
  });
});
