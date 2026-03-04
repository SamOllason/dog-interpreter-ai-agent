import { getClarifyingQuestion } from "../clarifyingQuestion";
import type { DogInterpretation, Motivation } from "../types";

function makeInterpretation(
  topMotivation: Motivation,
  secondMotivation: Motivation | null,
  scores: { top: number; second?: number },
  confidence: number
): DogInterpretation {
  const ranked = [
    {
      motivation: topMotivation,
      score: scores.top,
      evidence: [],
    },
  ];

  if (secondMotivation && typeof scores.second === "number") {
    ranked.push({
      motivation: secondMotivation,
      score: scores.second,
      evidence: [],
    });
  }

  return {
    summary: "",
    rankedMotivations: ranked,
    recommendedHumanAction: "",
    confidence,
    trace: [],
  };
}

describe("getClarifyingQuestion", () => {
  it("returns null when confidence is high", () => {
    const interp = makeInterpretation("food_request", "attention_seeking", { top: 0.8, second: 0.15 }, 0.9);
    const q = getClarifyingQuestion(interp);
    expect(q).toBeNull();
  });

  it("returns null when there is no second motivation", () => {
    const interp = makeInterpretation("food_request", null, { top: 1 }, 0.4);
    const q = getClarifyingQuestion(interp);
    expect(q).toBeNull();
  });

  it("asks food vs attention question when those two are close and confidence is low", () => {
    const interp = makeInterpretation("food_request", "attention_seeking", { top: 0.4, second: 0.33 }, 0.45);
    const q = getClarifyingQuestion(interp);
    expect(q).not.toBeNull();
    expect(q!.id).toBe("add_detail_food_vs_attention");
    expect(q!.text.toLowerCase()).toContain("food");
  });

  it("asks toilet vs boredom question when those two are close and confidence is low", () => {
    const interp = makeInterpretation("toilet_needed", "boredom", { top: 0.38, second: 0.32 }, 0.42);
    const q = getClarifyingQuestion(interp);
    expect(q).not.toBeNull();
    expect(q!.id).toBe("add_detail_toilet_vs_boredom");
    expect(q!.text.toLowerCase()).toContain("door");
  });

  it("falls back to a general question for other ambiguous cases", () => {
    const interp = makeInterpretation("alerting", "discomfort", { top: 0.36, second: 0.31 }, 0.4);
    const q = getClarifyingQuestion(interp);
    expect(q).not.toBeNull();
    expect(q!.id).toBe("add_detail_general");
  });
});

