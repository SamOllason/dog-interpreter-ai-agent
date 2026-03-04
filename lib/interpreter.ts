/**
 * Deterministic orchestrator: run all modules (tools), score motivations, build DogInterpretation.
 *
 * LEARNING: The orchestrator never parses free text from an LLM. It only (1) calls
 * each tool with the scenario string, (2) collects typed outputs, (3) runs
 * scoring logic that maps signals → motivation weights, (4) normalizes and
 * builds the final object. Adding a new tool = add its output to CollectedSignals
 * and use it in scoreMotivations where relevant.
 */

import type {
  DogInterpretation,
  ModuleActivation,
  Motivation,
  MotivationScore,
  DogInterpreterMultiAgentResult,
} from "./types";
import {
  MODULES,
  MODULE_NAMES,
  type FoodContextOutput,
  type BodyLanguageOutput,
  type RewardMemoryOutput,
  type EmotionStateOutput,
  type TimeContextOutput,
  type LocationFromScenarioOutput,
  type WeatherContextOutput,
  locationFromScenario,
  weatherContext,
} from "./modules";
import { runSafetyReview } from "./safetyAgent";

// --- Scoring: aggregate signals into motivation weights + evidence -------------
// LEARNING: CollectedSignals is the bag of all tool outputs. When you add a new
// tool, add its type here and pass it from the trace in runDogInterpreter.

interface CollectedSignals {
  food: FoodContextOutput;
  body: BodyLanguageOutput;
  memory: RewardMemoryOutput;
  emotion: EmotionStateOutput;
  time: TimeContextOutput;
  weather: WeatherContextOutput;
}

/** One raw motivation bucket: score, evidence labels, and each weight added (for showing the maths). */
type RawBucket = { score: number; evidence: string[]; contributions: number[] };

function scoreMotivations(signals: CollectedSignals): MotivationScore[] {
  const { food, body, memory, emotion, time, weather } = signals;
  const raw: Record<Motivation, RawBucket> = {
    food_request: { score: 0, evidence: [], contributions: [] },
    toilet_needed: { score: 0, evidence: [], contributions: [] },
    attention_seeking: { score: 0, evidence: [], contributions: [] },
    boredom: { score: 0, evidence: [], contributions: [] },
    alerting: { score: 0, evidence: [], contributions: [] },
    discomfort: { score: 0, evidence: [], contributions: [] },
    play: { score: 0, evidence: [], contributions: [] },
  };

  // Food request: food context + staring/whining near food
  if (food.foodPresent || food.eatingNearby || food.mealTimeCues) {
    const w = food.eatingNearby ? 0.5 : food.mealTimeCues ? 0.35 : 0.25;
    raw.food_request.score += w;
    raw.food_request.contributions.push(w);
    if (food.eatingNearby) raw.food_request.evidence.push("eating nearby");
    if (food.mealTimeCues) raw.food_request.evidence.push("meal time cues");
    if (body.staring && memory.stareGotReward) {
      raw.food_request.score += 0.3;
      raw.food_request.contributions.push(0.3);
      raw.food_request.evidence.push("staring (previously rewarded)");
    }
    if (body.whining) {
      raw.food_request.score += 0.15;
      raw.food_request.contributions.push(0.15);
      raw.food_request.evidence.push("whining");
    }
  }

  // Toilet: door focus + pacing/sniffing (+ timeContext: night/evening strengthens signal)
  if (body.doorFocus || body.pacing || body.sniffing) {
    if (body.doorFocus) {
      raw.toilet_needed.score += 0.4;
      raw.toilet_needed.contributions.push(0.4);
      raw.toilet_needed.evidence.push("focused on door");
    }
    if (body.pacing) {
      raw.toilet_needed.score += 0.25;
      raw.toilet_needed.contributions.push(0.25);
      raw.toilet_needed.evidence.push("pacing");
    }
    if (body.sniffing) {
      raw.toilet_needed.score += 0.2;
      raw.toilet_needed.contributions.push(0.2);
      raw.toilet_needed.evidence.push("sniffing ground");
    }
    if (memory.learnedDoorMeansOutside) {
      raw.toilet_needed.score += 0.2;
      raw.toilet_needed.contributions.push(0.2);
      raw.toilet_needed.evidence.push("learned: door = outside");
    }
    if (time.timeOfDay === "night" || time.timeOfDay === "evening") {
      raw.toilet_needed.score += 0.15;
      raw.toilet_needed.contributions.push(0.15);
      raw.toilet_needed.evidence.push(`${time.timeOfDay} (typical toilet time)`);
    }
    if (weather.isCold && body.doorFocus) {
      raw.toilet_needed.score += 0.1;
      raw.toilet_needed.contributions.push(0.1);
      raw.toilet_needed.evidence.push("cold; door focus");
    }
  }

  // Attention seeking: whining + learned behaviour
  if (body.whining || (body.staring && !food.eatingNearby)) {
    const w = body.whining ? 0.35 : 0.2;
    raw.attention_seeking.score += w;
    raw.attention_seeking.contributions.push(w);
    if (body.whining) raw.attention_seeking.evidence.push("whining");
    if (memory.whineGotAttention) {
      raw.attention_seeking.score += 0.25;
      raw.attention_seeking.contributions.push(0.25);
      raw.attention_seeking.evidence.push("whining got attention before");
    }
    if (body.staring && !food.eatingNearby)
      raw.attention_seeking.evidence.push("staring at you");
  }

  // Boredom: emotion + restlessness without strong door/food
  if (emotion.bored || (emotion.restless && !body.doorFocus)) {
    const w = emotion.bored ? 0.4 : 0.2;
    raw.boredom.score += w;
    raw.boredom.contributions.push(w);
    if (emotion.bored) raw.boredom.evidence.push("boredom indicators");
    if (emotion.restless && !body.doorFocus)
      raw.boredom.evidence.push("restless");
    if (body.pacing && !body.doorFocus)
      raw.boredom.evidence.push("pacing (no door focus)");
  }

  // Alerting: sniffing + door / something outside
  if (body.sniffing || (body.doorFocus && emotion.anxious)) {
    const w = body.sniffing ? 0.3 : 0.2;
    raw.alerting.score += w;
    raw.alerting.contributions.push(w);
    if (body.sniffing) raw.alerting.evidence.push("sniffing");
    if (body.doorFocus && emotion.anxious)
      raw.alerting.evidence.push("door focus + anxious");
  }

  // Discomfort: anxious without clear other cause; or hot weather (panting could be thermal)
  if (emotion.anxious && raw.food_request.score < 0.3 && raw.toilet_needed.score < 0.3) {
    raw.discomfort.score += 0.35;
    raw.discomfort.contributions.push(0.35);
    raw.discomfort.evidence.push("anxious");
  }
  if (weather.isHot) {
    raw.discomfort.score += 0.2;
    raw.discomfort.contributions.push(0.2);
    raw.discomfort.evidence.push("hot day");
  }

  // Play: excited + tail up
  if (emotion.excited || body.tailUp) {
    const w = emotion.excited ? 0.35 : 0.2;
    raw.play.score += w;
    raw.play.contributions.push(w);
    if (emotion.excited) raw.play.evidence.push("excited");
    if (body.tailUp) raw.play.evidence.push("tail up");
  }

  // Normalize to get a relative value: sum to 1, keep only non-zero, sort descending
  const total = Object.values(raw).reduce((s, x) => s + x.score, 0);
  const scale = total > 0 ? 1 / total : 1;
  const result: MotivationScore[] = (Object.entries(raw) as [Motivation, RawBucket][])
    .filter(([, x]) => x.score > 0)
    .map(([motivation, { score, evidence, contributions }]) => {
      const normalised = Math.round(scale * score * 100) / 100;
      const calculation =
        contributions.length > 0
          ? `${contributions.map((c, i) => `${c.toFixed(2)} (${evidence[i] ?? "signal"})`).join(" + ")} = ${score.toFixed(2)} raw → × (1/${total.toFixed(2)}) ≈ ${normalised.toFixed(2)} (normalised so all scores sum to 1)`
          : undefined;
      return {
        motivation,
        score: normalised,
        evidence: evidence.length > 0 ? evidence : ["general signals"],
        calculation,
      };
    })
    .sort((a, b) => b.score - a.score);

  // If nothing matched, default to attention_seeking with low score
  if (result.length === 0) {
    result.push({
      motivation: "attention_seeking",
      score: 0.5,
      evidence: ["unclear; defaulting to possible attention seeking"],
    });
  }

  return result;
}

// --- Summary + recommended action from top motivation(s) --------------------

const MOTIVATION_SUMMARIES: Record<Motivation, string> = {
  food_request: "Dog likely wants food or is reacting to food cues.",
  toilet_needed: "Dog may need to go outside to toilet.",
  attention_seeking: "Dog is likely seeking your attention.",
  boredom: "Dog may be bored or understimulated.",
  alerting: "Dog may be alerting to something (e.g. outside).",
  discomfort: "Dog may be uncomfortable or anxious.",
  play: "Dog seems to want to play.",
};

const RECOMMENDED_ACTIONS: Record<Motivation, string> = {
  food_request: "If it’s not meal time, ignore begging; reward calm. If it is, feed after a calm behaviour.",
  toilet_needed: "Let them out briefly; keep it calm; reward toileting.",
  attention_seeking: "Decide: give brief attention for calm behaviour, or redirect to a toy/activity.",
  boredom: "Offer a chew, puzzle, or short play session; consider a walk later.",
  alerting: "Check what they’re focused on; reassure if it’s nothing; don’t reinforce alarm.",
  discomfort: "Check for pain or stressors; give space; avoid forcing interaction.",
  play: "Offer a short play session if you can; otherwise redirect to a toy.",
};

function buildSummary(ranked: MotivationScore[]): string {
  const top = ranked[0];
  if (!top) return "Unclear what the dog wants.";
  return MOTIVATION_SUMMARIES[top.motivation];
}

function buildRecommendedAction(ranked: MotivationScore[]): string {
  const top = ranked[0];
  if (!top) return "Observe and try to notice patterns; avoid reinforcing unwanted behaviour.";
  return RECOMMENDED_ACTIONS[top.motivation];
}

// --- Confidence: higher when top is clear and supported ---------------------

function computeConfidence(
  ranked: MotivationScore[],
  traceLength: number
): { confidence: number; explanation: string } {
  if (ranked.length === 0) {
    return { confidence: 0.3, explanation: "No motivations scored; using default low confidence." };
  }
  const top = ranked[0].score;
  const second = ranked.length > 1 ? ranked[1].score : 0;
  const gap = top - second;
  // Base + gap bonus + support from multiple modules (trace length)
  let c = 0.4 + gap * 0.4 + Math.min(traceLength * 0.05, 0.2);
  const confidence = Math.max(0.2, Math.min(1, Math.round(c * 100) / 100));

  const parts: string[] = [];
  if (gap > 0.3) parts.push("top motivation clearly ahead of the rest");
  else if (gap > 0.1) parts.push("moderate gap between top and second");
  else parts.push("top and second motivation close");
  parts.push(`${traceLength} modules ran`);
  const explanation = `Confidence (${(confidence * 100).toFixed(0)}%): ${parts.join("; ")}.`;

  return { confidence, explanation };
}

// --- Orchestrator -----------------------------------------------------------
// LEARNING: Single pass over all tools — same input, collect all outputs into trace.
// Then pull each tool's output from the trace and pass to scoreMotivations.
// Adding a new tool = add to MODULE_NAMES/MODULES, then add one find() and include in signals.

export async function runDogInterpreter(input: string): Promise<DogInterpretation> {
  const trimmed = input.trim();
  const trace: ModuleActivation[] = [];

  // Step 1: run all scenario-based modules with the full text input.
  for (const name of MODULE_NAMES) {
    const raw = MODULES[name](trimmed);
    const output = await Promise.resolve(raw);
    trace.push({ module: name, input: trimmed, output });
  }

  // Step 2A: explicit locationFromScenario tool (scenario → coarse location label).
  const locationResult: LocationFromScenarioOutput = locationFromScenario(trimmed);
  trace.push({
    module: "locationFromScenario",
    input: trimmed,
    output: locationResult,
  });

  // Step 2B: weatherContext chained on location (location → weather/temperature).
  const weatherResult: WeatherContextOutput = await weatherContext(locationResult.location);
  trace.push({
    module: "weatherContext",
    input: locationResult.location,
    output: weatherResult,
  });

  const food = trace.find((t) => t.module === "foodContext")?.output as FoodContextOutput;
  let body = trace.find((t) => t.module === "bodyLanguage")?.output as BodyLanguageOutput;
  const memory = trace.find((t) => t.module === "rewardMemory")?.output as RewardMemoryOutput;
  const emotion = trace.find((t) => t.module === "emotionState")?.output as EmotionStateOutput;
  const time = trace.find((t) => t.module === "timeContext")?.output as TimeContextOutput;
  const weather = weatherResult;

  // Step 2C: optional LLM-backed refinement of body-language signals (server-only).
  // LEARNING: This shows how you could plug an LLM into a single module
  // without changing the rest of the orchestrator.
  if (typeof window === "undefined" && process.env.OPENAI_API_KEY) {
    try {
      const { inferBodyLanguageSignals } = await import("./llm/bodyLanguageClient");
      const llmBody = await inferBodyLanguageSignals(trimmed);

      // Update the trace entry so the UI shows the LLM-backed output.
      const bodyIndex = trace.findIndex((t) => t.module === "bodyLanguage");
      if (bodyIndex !== -1) {
        trace[bodyIndex] = { ...trace[bodyIndex], output: llmBody };
      }

      body = llmBody;
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("LLM bodyLanguage refinement failed; using rule-based signals instead.", error);
      }
    }
  }

  const signals: CollectedSignals = { food, body, memory, emotion, time, weather };
  const rankedMotivations = scoreMotivations(signals);
  const { confidence, explanation: confidenceExplanation } = computeConfidence(
    rankedMotivations,
    trace.length
  );
  const summary = buildSummary(rankedMotivations);
  const recommendedHumanAction = buildRecommendedAction(rankedMotivations);

  return {
    summary,
    rankedMotivations,
    recommendedHumanAction,
    confidence,
    confidenceExplanation,
    trace,
  };
}

/**
 * Multi-agent wrapper: primary interpreter + safety/critic agent.
 *
 * LEARNING: This keeps `runDogInterpreter` unchanged and adds a second,
 * independent pass (`runSafetyReview`) whose job is to assess risk. The UI can
 * render and compare both to teach multi-agent traceability.
 */
export async function runDogInterpreterWithSafety(
  input: string
): Promise<DogInterpreterMultiAgentResult> {
  const primary = await runDogInterpreter(input);
  const safety = runSafetyReview(input, primary);

  return { primary, safety };
}
