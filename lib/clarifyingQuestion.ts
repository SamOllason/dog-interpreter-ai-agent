import type { ClarifyingQuestion, DogInterpretation } from "./types";

// Consider asking a clarifying question when overall confidence is below 0.8.
// Confidence in this app is usually between ~0.6 and 1.0, so 0.8 gives a
// visible "uncertain but not terrible" band for learning.
const CONFIDENCE_THRESHOLD = 0.8;
const GAP_THRESHOLD = 0.15;

/**
 * Decide whether to ask a clarifying question based on the current interpretation.
 *
 * LEARNING: This keeps the "clarifying loop" as a thin layer on top of the
 * deterministic interpreter. The interpreter still returns a single
 * DogInterpretation; this helper suggests a follow-up question that the UI
 * can show when confidence is low or motivations are ambiguous.
 */
export function getClarifyingQuestion(
  interpretation: DogInterpretation
): ClarifyingQuestion | null {
  const ranked = interpretation.rankedMotivations;
  if (ranked.length === 0) return null;

  const [top, second] = ranked;

  // Only consider questions when confidence is below a threshold and there's
  // at least a second candidate motivation to compare against.
  if (!second || interpretation.confidence >= CONFIDENCE_THRESHOLD) {
    return null;
  }

  const gap = top.score - second.score;
  if (gap >= GAP_THRESHOLD) {
    // Top motivation is clearly ahead; no clarifying question needed.
    return null;
  }

  const pair = new Set([top.motivation, second.motivation]);

  if (pair.has("food_request") && pair.has("attention_seeking")) {
    return {
      id: "add_detail_food_vs_attention",
      text: "Is there food or treats visible or recently given in this moment?",
    };
  }

  if (pair.has("toilet_needed") && pair.has("boredom")) {
    return {
      id: "add_detail_toilet_vs_boredom",
      text: "Is your dog focused on the door or showing typical toilet cues, like sniffing the ground near an exit?",
    };
  }

  return {
    id: "add_detail_general",
    text: "Could you add a bit more detail about what your dog is doing (body language, food nearby, door or outside context, recent walk)?",
  };
}

