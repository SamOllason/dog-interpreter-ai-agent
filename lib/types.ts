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
  | "locationFromScenario"
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

/**
 * Clarifying question suggested when the interpretation is uncertain or ambiguous.
 * The UI can use this to prompt the user for more detail, then re-run the interpreter.
 */
export interface ClarifyingQuestion {
  /** Identifier for the question template (useful if you later add structured answers). */
  id:
    | "add_detail_food_vs_attention"
    | "add_detail_toilet_vs_boredom"
    | "add_detail_general";
  /** Human-readable question text to show in the UI. */
  text: string;
}

/**
 * Safety / critic agent types
 *
 * These model a second, independent pass over the primary interpretation whose
 * job is to assess risk and surface potential issues – not to change the
 * primary scores.
 */
export type SafetyRiskLevel = "low" | "medium" | "high";

export interface SafetyIssue {
  /** Stable identifier so tests / logging can refer to a specific rule. */
  id:
    | "low_confidence_primary"
    | "discomfort_or_health_signals"
    | "possible_health_keywords"
    | "unclear_but_caution";
  description: string;
  severity: SafetyRiskLevel;
  /** Motivations that this issue is most closely related to (if any). */
  relatedMotivations?: Motivation[];
}

export interface SafetyReview {
  /** Overall qualitative risk assessment for this scenario + interpretation. */
  overallRisk: SafetyRiskLevel;
  /** Whether it is likely safe to follow the recommended action as-is. */
  safeToAct: boolean;
  /** Individual issues or considerations raised by the safety agent. */
  issues: SafetyIssue[];
  /**
   * Short human-readable notes explaining how the safety agent arrived at its
   * decision. The UI uses this to teach multi-agent traceability.
   */
  rationale: string[];
}

/**
 * Top-level result when running the interpreter together with the safety agent.
 * The primary agent remains unchanged; this bundles its output with an
 * independent safety review so the UI can display and compare both.
 */
export interface DogInterpreterMultiAgentResult {
  primary: DogInterpretation;
  safety: SafetyReview;
  /**
   * Optional trace of a higher-level supervisor / planner that decided
   * which tools to call and when to stop. Used to teach ReAct-style loops.
   */
  supervisor?: SupervisorTrace;
  /**
   * Optional clarifying question suggested by the supervisor loop. The UI
   * can show this to the user to guide a follow-up turn.
   */
  clarifyingQuestion?: ClarifyingQuestion | null;
}

export type SupervisorAction =
  | "call_interpreter"
  | "ask_clarifying_question"
  | "finish";

export interface SupervisorStep {
  step: number;
  action: SupervisorAction;
  reason: string;
}

export interface SupervisorTrace {
  steps: SupervisorStep[];
}
