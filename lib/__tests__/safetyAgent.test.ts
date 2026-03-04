import { runSafetyReview } from "../safetyAgent";
import type { DogInterpretation, Motivation } from "../types";

function makeInterpretation(
  topMotivation: Motivation,
  score: number,
  confidence: number
): DogInterpretation {
  return {
    summary: "",
    rankedMotivations: [
      {
        motivation: topMotivation,
        score,
        evidence: [],
      },
    ],
    recommendedHumanAction: "",
    confidence,
    trace: [],
  };
}

describe("runSafetyReview", () => {
  it("treats a confident, everyday scenario as low risk and safe to act", () => {
    const interp = makeInterpretation("play", 0.8, 0.9);
    const review = runSafetyReview(
      "She dropped into a play bow in the garden and keeps bouncing toward the ball.",
      interp
    );

    expect(review.overallRisk).toBe("low");
    expect(review.safeToAct).toBe(true);
    expect(review.issues.length).toBe(0);
    expect(review.rationale.length).toBeGreaterThan(0);
  });

  it("flags low-confidence interpretations as medium risk and still safeToAct", () => {
    const interp = makeInterpretation("attention_seeking", 0.4, 0.42);
    const review = runSafetyReview("He's whining at me even though nothing obvious is happening.", interp);

    expect(review.overallRisk).toBe("medium");
    expect(review.safeToAct).toBe(true);
    expect(review.issues.some((i) => i.id === "low_confidence_primary")).toBe(true);
  });

  it("raises high risk and not safeToAct when discomfort and health keywords are present", () => {
    const interp = makeInterpretation("discomfort", 0.6, 0.6);
    const review = runSafetyReview(
      "She's panting heavily and seems lethargic, won't eat and just lies there.",
      interp
    );

    expect(review.overallRisk).toBe("high");
    expect(review.safeToAct).toBe(false);
    expect(review.issues.some((i) => i.id === "discomfort_or_health_signals")).toBe(true);
    expect(review.issues.some((i) => i.id === "possible_health_keywords")).toBe(true);
  });
});

