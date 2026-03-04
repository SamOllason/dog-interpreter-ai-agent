/**
 * Unit tests for module stubs: inputs → structured signal outputs.
 */

import {
  foodContext,
  bodyLanguage,
  rewardMemory,
  emotionState,
  timeContext,
  locationFromScenario,
  weatherContext,
} from "../modules";

describe("foodContext", () => {
  it("returns foodPresent and eatingNearby when human is eating", () => {
    const input = "He's staring at me while I eat toast and whining softly.";
    const out = foodContext(input);
    expect(out).toEqual({
      foodPresent: true,
      mealTimeCues: false,
      eatingNearby: true,
    });
  });

  it("returns all false for scenario with no food cues", () => {
    const input = "Pacing by the back door, sniffing the ground.";
    const out = foodContext(input);
    expect(out.foodPresent).toBe(false);
    expect(out.mealTimeCues).toBe(false);
    expect(out.eatingNearby).toBe(false);
  });

  it("detects meal time cues", () => {
    const out = foodContext("It's breakfast time and he's waiting by his bowl.");
    expect(out.mealTimeCues).toBe(true);
    expect(out.foodPresent).toBe(true);
  });
});

describe("bodyLanguage", () => {
  it("detects staring, whining for food scenario (rule-based by default)", async () => {
    const input = "He's staring at me while I eat toast and whining softly.";
    const out = await bodyLanguage(input);
    expect(out.staring).toBe(true);
    expect(out.whining).toBe(true);
  });

  it("detects pacing, door focus, sniffing for toilet scenario (rule-based by default)", async () => {
    const input = "He's pacing by the back door and sniffing the ground, it's 10pm.";
    const out = await bodyLanguage(input);
    expect(out.pacing).toBe(true);
    expect(out.doorFocus).toBe(true);
    expect(out.sniffing).toBe(true);
  });

  it("returns all false for unrelated text (rule-based by default)", async () => {
    const out = await bodyLanguage("The weather is nice.");
    expect(out.staring).toBe(false);
    expect(out.pacing).toBe(false);
    expect(out.doorFocus).toBe(false);
    expect(out.whining).toBe(false);
  });
});

describe("rewardMemory", () => {
  it("links door to outside when door mentioned", () => {
    const out = rewardMemory("Pacing by the back door, wants to go outside.");
    expect(out.learnedDoorMeansOutside).toBe(true);
  });

  it("links stare to reward when food/stare present", () => {
    const out = rewardMemory("Staring at me while I eat toast.");
    expect(out.stareGotReward).toBe(true);
  });

  it("links whine to attention when whining mentioned", () => {
    const out = rewardMemory("Whining for attention.");
    expect(out.whineGotAttention).toBe(true);
  });
});

describe("emotionState", () => {
  it("detects restless when pacing mentioned", () => {
    const out = emotionState("Pacing by the door, can't settle.");
    expect(out.restless).toBe(true);
  });

  it("detects bored for boredom keywords", () => {
    const out = emotionState("He seems bored, nothing to do.");
    expect(out.bored).toBe(true);
  });

  it("detects excited for play context", () => {
    const out = emotionState("Tail wagging, so excited to play.");
    expect(out.excited).toBe(true);
  });
});

describe("timeContext", () => {
  it("detects night from time mention", () => {
    const out = timeContext("He's pacing by the back door, it's 10pm.");
    expect(out.timeOfDay).toBe("night");
  });

  it("detects evening from keywords", () => {
    const out = timeContext("Restless in the evening after work.");
    expect(out.timeOfDay).toBe("evening");
  });

  it("detects morning from breakfast", () => {
    const out = timeContext("Waiting by his bowl at breakfast.");
    expect(out.timeOfDay).toBe("morning");
    expect(out.nearMealTime).toBe(true);
  });

  it("returns unknown when no time cues", () => {
    const out = timeContext("She's whining and staring.");
    expect(out.timeOfDay).toBe("unknown");
    expect(out.nearMealTime).toBe(false);
  });
});

describe("locationFromScenario + weatherContext (chaining)", () => {
  it("infers garden location and hot weather for garden scenario", async () => {
    const scenario = "She's panting in the garden and won't settle.";
    const loc = locationFromScenario(scenario);
    expect(loc).toEqual({ location: "garden" });

    const weather = await weatherContext(loc.location);
    expect(weather).toMatchObject({
      locationUsed: "garden",
      tempC: expect.any(Number),
      isHot: true,
      isCold: false,
    });
  });

  it("defaults to home when no location cues", async () => {
    const scenario = "Inside on the sofa, nothing unusual.";
    const loc = locationFromScenario(scenario);
    expect(loc).toEqual({ location: "home" });

    const weather = await weatherContext(loc.location);
    expect(weather.locationUsed).toBe("home");
  });
});
