/**
 * Phase 1 module stubs (tools). Each takes the scenario string and returns
 * structured signals (keyword-based for now). Used by runDogInterpreter to
 * build trace + scoring.
 *
 * LEARNING: Adding a new tool = (1) define an Output type, (2) implement
 * a function (input: string) => Output, (3) add to MODULE_NAMES and MODULES.
 * The orchestrator will call it and record input/output in the trace. No
 * other code needs to know how the tool is implemented (rules vs LLM vs API).
 */

import type { ModuleName } from "./types";

// --- Output types (structured signals from each module) ---------------------

export interface FoodContextOutput {
  foodPresent: boolean;
  mealTimeCues: boolean;
  eatingNearby: boolean;
}

export interface BodyLanguageOutput {
  staring: boolean;
  pacing: boolean;
  doorFocus: boolean;
  whining: boolean;
  tailUp: boolean;
  sniffing: boolean;
}

export interface RewardMemoryOutput {
  learnedDoorMeansOutside: boolean;
  stareGotReward: boolean;
  whineGotAttention: boolean;
}

export interface EmotionStateOutput {
  restless: boolean;
  anxious: boolean;
  excited: boolean;
  bored: boolean;
}

/**
 * Output of the timeContext tool. Extracted from the scenario text using
 * simple keyword rules. In a more advanced setup, this could come from an
 * LLM ("what time of day is implied?") or a real API (e.g. user's local time).
 */
export interface TimeContextOutput {
  /** Inferred from words like "10pm", "morning", "breakfast", "dinner" */
  timeOfDay: "morning" | "afternoon" | "evening" | "night" | "unknown";
  /** True if scenario mentions meal times (breakfast, lunch, dinner, feeding) */
  nearMealTime: boolean;
}

/**
 * Output of the weatherContext tool. Mimics a temperature/weather API.
 * Mock: delay + return based on location. Later: swap for e.g. Open-Meteo.
 * See docs/next-steps-chaining-and-api.md.
 */
export interface WeatherContextOutput {
  tempC: number;
  conditions: string;
  isHot: boolean;
  isCold: boolean;
  locationUsed: string;
}

// --- Helpers ----------------------------------------------------------------

function hasAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

// --- Module stubs -----------------------------------------------------------

export function foodContext(input: string): FoodContextOutput {
  const t = input.toLowerCase();
  return {
    foodPresent: hasAny(t, ["food", "eat", "eating", "toast", "meal", "dinner", "breakfast", "treat", "feed"]),
    mealTimeCues: hasAny(t, ["meal", "dinner", "breakfast", "lunch", "feeding time"]),
    eatingNearby: hasAny(t, ["while i eat", "when i eat", "eating", "at the table"]),
  };
}

export function bodyLanguage(input: string): BodyLanguageOutput {
  const t = input.toLowerCase();
  return {
    staring: hasAny(t, ["staring", "stare", "stares", "watching", "eyes on"]),
    pacing: hasAny(t, ["pacing", "pace", "pacing around", "restless"]),
    doorFocus: hasAny(t, ["door", "back door", "front door", "by the door"]),
    whining: hasAny(t, ["whining", "whine", "whining softly", "whines"]),
    tailUp: hasAny(t, ["tail up", "tail wag", "wagging", "tail"]),
    sniffing: hasAny(t, ["sniffing", "sniff", "sniffing the ground"]),
  };
}

export function rewardMemory(input: string): RewardMemoryOutput {
  const t = input.toLowerCase();
  return {
    learnedDoorMeansOutside: hasAny(t, ["door", "outside", "let him out", "let her out"]),
    stareGotReward: hasAny(t, ["staring", "stare", "treat", "food", "eat"]),
    whineGotAttention: hasAny(t, ["whining", "whine", "attention"]),
  };
}

export function emotionState(input: string): EmotionStateOutput {
  const t = input.toLowerCase();
  return {
    restless: hasAny(t, ["restless", "pacing", "can't settle", "fidget"]),
    anxious: hasAny(t, ["anxious", "anxiety", "nervous", "whining", "pacing"]),
    excited: hasAny(t, ["excited", "excitement", "wagging", "jumping"]),
    bored: hasAny(t, ["bored", "boredom", "nothing to do", "restless", "pacing"]),
  };
}

/**
 * timeContext — infers time-of-day and meal-time cues from the scenario.
 *
 * LEARNING: This is an example of "adding a new tool" without changing the
 * rest of the system. Same contract: (input: string) => TimeContextOutput.
 * The orchestrator calls it like any other module and uses the result in
 * scoring (e.g. door + night → slightly stronger toilet_needed). Later you
 * could replace this with an LLM call or a real time API; the rest of the
 * pipeline stays the same.
 */
export function timeContext(input: string): TimeContextOutput {
  const t = input.toLowerCase();

  // Infer time of day from explicit mentions or meal cues
  let timeOfDay: TimeContextOutput["timeOfDay"] = "unknown";
  if (hasAny(t, ["10pm", "11pm", "midnight", "late at night", "at night", "night time", "bedtime"])) {
    timeOfDay = "night";
  } else if (hasAny(t, ["evening", "dusk", "after work", "dinner time"])) {
    timeOfDay = "evening";
  } else if (hasAny(t, ["afternoon", "lunch time", "lunch"])) {
    timeOfDay = "afternoon";
  } else if (hasAny(t, ["morning", "breakfast", "early"])) {
    timeOfDay = "morning";
  }

  const nearMealTime = hasAny(t, ["breakfast", "lunch", "dinner", "meal time", "feeding time", "dinner time"]);

  return { timeOfDay, nearMealTime };
}

// --- Weather (mocked API: demonstrates async tool + internal chaining) -------

const MOCK_WEATHER_BY_LOCATION: Record<
  string,
  { tempC: number; conditions: string }
> = {
  home: { tempC: 22, conditions: "mild" },
  garden: { tempC: 30, conditions: "sunny" },
  outside: { tempC: 20, conditions: "cloudy" },
  park: { tempC: 24, conditions: "sunny" },
  walk: { tempC: 8, conditions: "breezy" },
};

function extractLocationFromScenario(scenario: string): string {
  const t = scenario.toLowerCase();
  if (hasAny(t, ["garden", "backyard", "yard"])) return "garden";
  if (hasAny(t, ["park", "field"])) return "park";
  if (hasAny(t, ["outside", "outdoors", "out for a walk", "on the walk"])) return "outside";
  if (hasAny(t, ["walk", "walking", "on a walk"])) return "walk";
  return "home";
}

/** Simulate network delay (e.g. 80ms). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * weatherContext — async tool that mimics a temperature/weather API.
 * Chain inside the tool: scenario → extract location → "call" API (delay + lookup).
 * Used in scoring: isHot → discomfort; isCold + door → toilet. See docs/next-steps-chaining-and-api.md.
 */
export async function weatherContext(
  input: string
): Promise<WeatherContextOutput> {
  const location = extractLocationFromScenario(input);
  await delay(80);
  const data = MOCK_WEATHER_BY_LOCATION[location] ?? MOCK_WEATHER_BY_LOCATION.home;
  const tempC = data.tempC;
  return {
    tempC,
    conditions: data.conditions,
    isHot: tempC >= 28,
    isCold: tempC <= 10,
    locationUsed: location,
  };
}

// --- Registry for orchestrator ----------------------------------------------
// LEARNING: The orchestrator loops over MODULE_NAMES and calls MODULES[name](input).
// To add a tool, add its name here and its function to MODULES. Trace updates automatically.

export const MODULE_NAMES: ModuleName[] = [
  "foodContext",
  "bodyLanguage",
  "rewardMemory",
  "emotionState",
  "timeContext",
  "weatherContext",
];

/** Tools: scenario in, structured output out. weatherContext returns Promise. */
export const MODULES: Record<
  ModuleName,
  (
    input: string
  ) =>
    | FoodContextOutput
    | BodyLanguageOutput
    | RewardMemoryOutput
    | EmotionStateOutput
    | TimeContextOutput
    | Promise<WeatherContextOutput>
> = {
  foodContext,
  bodyLanguage,
  rewardMemory,
  emotionState,
  timeContext,
  weatherContext,
};
