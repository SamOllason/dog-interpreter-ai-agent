/**
 * Unit tests for runDogInterpreter: scenario string → DogInterpretation.
 * Shows example inputs and expected shape / top motivations.
 */

import { runDogInterpreter } from "../interpreter";

describe("runDogInterpreter", () => {
  it("returns full DogInterpretation shape for any input", async () => {
    const input = "Something random.";
    const result = await runDogInterpreter(input);

    expect(result).toMatchObject({
      summary: expect.any(String),
      rankedMotivations: expect.any(Array),
      recommendedHumanAction: expect.any(String),
      confidence: expect.any(Number),
      trace: expect.any(Array),
    });
    expect(result.rankedMotivations.length).toBeGreaterThanOrEqual(1);
    expect(result.trace.length).toBe(7); // all scenario modules + locationFromScenario + weatherContext
    expect(result.confidence).toBeGreaterThanOrEqual(0.2);
    expect(result.confidence).toBeLessThanOrEqual(1);

    const sum = result.rankedMotivations.reduce((s, m) => s + m.score, 0);
    // When multiple motivations: sum ~1. When fallback only: single score (e.g. 0.5).
    expect(sum).toBeGreaterThan(0);
    expect(sum).toBeLessThanOrEqual(1.01);
    if (result.rankedMotivations.length > 1) expect(sum).toBeCloseTo(1, 1);
  });

  it("interprets food scenario: top motivation food_request", async () => {
    const input = "He's staring at me while I eat toast and whining softly.";
    const result = await runDogInterpreter(input);

    expect(result.summary).toContain("food");
    expect(result.rankedMotivations[0].motivation).toBe("food_request");
    expect(result.rankedMotivations[0].evidence.length).toBeGreaterThan(0);
    expect(result.rankedMotivations[0].score).toBeGreaterThan(0.3);
  });

  it("interprets toilet scenario: top motivation toilet_needed", async () => {
    const input = "He's pacing by the back door and sniffing the ground, it's 10pm.";
    const result = await runDogInterpreter(input);

    const top = result.rankedMotivations[0];
    expect(top.motivation).toBe("toilet_needed");
    expect(top.evidence.some((e) => e.toLowerCase().includes("door") || e.includes("pacing"))).toBe(true);
    expect(result.recommendedHumanAction.toLowerCase()).toMatch(/out|toilet|briefly/);
  });

  it("trace contains all modules with correct inputs and outputs", async () => {
    const input = "Whining and staring.";
    const result = await runDogInterpreter(input);

    const names = result.trace.map((t) => t.module);
    expect(names).toContain("foodContext");
    expect(names).toContain("bodyLanguage");
    expect(names).toContain("rewardMemory");
    expect(names).toContain("emotionState");
    expect(names).toContain("timeContext");
    expect(names).toContain("locationFromScenario");
    expect(names).toContain("weatherContext");

    const trimmed = input.trim();
    const locationEntry = result.trace.find((t) => t.module === "locationFromScenario");
    expect(locationEntry).toBeDefined();
    const locationOutput = locationEntry!.output as { location: string };

    for (const entry of result.trace) {
      if (entry.module === "weatherContext") {
        // weatherContext should take the chained location string as input
        expect(entry.input).toBe(locationOutput.location);
      } else {
        // all other modules operate directly on the full scenario string
        expect(entry.input).toBe(trimmed);
      }
      expect(entry.output).toBeDefined();
      expect(typeof entry.output).toBe("object");
    }
  });

  it("weatherContext appears in trace and affects scoring (e.g. hot garden → discomfort)", async () => {
    const input = "She's panting in the garden and won't settle.";
    const result = await runDogInterpreter(input);

    const weatherEntry = result.trace.find((t) => t.module === "weatherContext");
    expect(weatherEntry).toBeDefined();
    expect(weatherEntry!.output).toMatchObject({
      locationUsed: "garden",
      tempC: expect.any(Number),
      isHot: true,
      isCold: false,
    });

    const discomfort = result.rankedMotivations.find((m) => m.motivation === "discomfort");
    if (discomfort) {
      expect(discomfort.evidence.some((e) => e.toLowerCase().includes("hot"))).toBe(true);
    }
  });

  it("empty input still returns valid interpretation with default motivation", async () => {
    const result = await runDogInterpreter("   ");

    expect(result.rankedMotivations.length).toBeGreaterThanOrEqual(1);
    expect(result.summary).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0.2);
  });
});
