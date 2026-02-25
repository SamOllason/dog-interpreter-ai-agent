/**
 * Source of truth: see README § Types
 *
 * When you add a new tool (e.g. timeContext), add its name here so the
 * orchestrator and trace stay typed. The UI will show it in the trace automatically.
 */

export type ModuleName =
  | "foodContext"
  | "bodyLanguage"
  | "rewardMemory"
  | "emotionState"
  | "timeContext"
  | "weatherContext";

export type Motivation =
  | "food_request"
  | "toilet_needed"
  | "attention_seeking"
  | "boredom"
  | "alerting"
  | "discomfort"
  | "play";

export interface ModuleActivation {
  module: ModuleName;
  input: unknown;
  output: unknown;
}

export interface MotivationScore {
  motivation: Motivation;
  score: number; // 0..1
  evidence: string[];
  /** Human-readable maths: raw weight addends and normalisation (e.g. "0.4 + 0.25 = 0.65 raw → 0.62 (normalised)"). */
  calculation?: string;
}

export interface DogInterpretation {
  summary: string;
  rankedMotivations: MotivationScore[];
  recommendedHumanAction: string;
  confidence: number; // 0..1
  /** Short explanation of how confidence was derived (e.g. gap between top scores, number of modules). */
  confidenceExplanation?: string;
  trace: ModuleActivation[];
}
