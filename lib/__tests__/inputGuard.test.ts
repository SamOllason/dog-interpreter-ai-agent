/**
 * Unit tests for validateScenario (input guard).
 * See bad-input-handling.md for the contract and behaviour.
 */

import { validateScenario } from "../inputGuard";

describe("validateScenario", () => {
  it("allows valid dog behaviour scenarios", () => {
    expect(validateScenario("He's staring at me while I eat toast and whining softly.")).toEqual({
      allowed: true,
    });
    expect(validateScenario("She's pacing by the back door and sniffing the ground.")).toEqual({
      allowed: true,
    });
    expect(validateScenario("My dog is bored and sighing.")).toEqual({ allowed: true });
  });

  it("rejects empty or whitespace-only input with reason empty", () => {
    expect(validateScenario("")).toEqual({ allowed: false, reason: "empty" });
    expect(validateScenario("   ")).toEqual({ allowed: false, reason: "empty" });
    expect(validateScenario("\t\n")).toEqual({ allowed: false, reason: "empty" });
  });

  it("rejects input containing blocklisted words with reason inappropriate", () => {
    expect(validateScenario("My stupid dog is barking")).toEqual({
      allowed: false,
      reason: "inappropriate",
    });
    expect(validateScenario("That damn puppy won't sit")).toEqual({
      allowed: false,
      reason: "inappropriate",
    });
  });

  it("rejects off-topic phrases with reason off_topic", () => {
    expect(validateScenario("What is 2+2?")).toEqual({ allowed: false, reason: "off_topic" });
    expect(validateScenario("Write me a poem")).toEqual({ allowed: false, reason: "off_topic" });
    expect(validateScenario("Hello world")).toEqual({ allowed: false, reason: "off_topic" });
  });

  it("rejects short input without dog-related keyword with reason off_topic", () => {
    expect(validateScenario("Hi there")).toEqual({ allowed: false, reason: "off_topic" });
    expect(validateScenario("Nothing much")).toEqual({ allowed: false, reason: "off_topic" });
  });

  it("rejects spam-like repeated input with reason spam", () => {
    const repeated = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(validateScenario(repeated)).toEqual({ allowed: false, reason: "spam" });
  });

  it("returns allowed: true for long enough dog-related input", () => {
    const result = validateScenario("My dog has been whining by the door all morning.");
    expect(result).toEqual({ allowed: true });
  });
});
