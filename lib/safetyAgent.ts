/**
 * Safety / critic agent
 *
 * This is a second, independent pass over the primary `DogInterpretation`. It
 * does not change the scores or recommended action; instead it asks:
 * - How certain is the primary agent?
 * - Are there any signals that might indicate discomfort or health issues?
 * - Should we treat the recommendation as safe to act on, or as "use caution"?
 *
 * The UI surfaces this as an additional, inspectable layer so people can learn
 * how multi-agent safety patterns work.
 */

import type {
  DogInterpretation,
  Motivation,
  SafetyIssue,
  SafetyReview,
  SafetyRiskLevel,
} from "./types";

function highestSeverity(issues: SafetyIssue[]): SafetyRiskLevel {
  const order: SafetyRiskLevel[] = ["low", "medium", "high"];
  return issues.reduce<SafetyRiskLevel>((acc, issue) => {
    return order.indexOf(issue.severity) > order.indexOf(acc) ? issue.severity : acc;
  }, "low");
}

/**
 * Run a lightweight safety review on top of the primary interpretation.
 *
 * LEARNING: In a real system this could be backed by its own tools or LLM
 * calls. Here it's a deterministic rule set so you can see exactly what fired.
 */
export function runSafetyReview(
  scenario: string,
  interpretation: DogInterpretation
): SafetyReview {
  const lower = scenario.toLowerCase();
  const issues: SafetyIssue[] = [];
  const rationale: string[] = [];

  const top = interpretation.rankedMotivations[0];

  // 1) Low confidence in the primary interpreter → treat as hypothesis only.
  if (interpretation.confidence < 0.5) {
    const related: Motivation[] = top ? [top.motivation] : [];
    issues.push({
      id: "low_confidence_primary",
      description:
        "The primary interpreter is uncertain (confidence below 50%). Treat this as a hypothesis, not a fact, and consider observing more before acting.",
      severity: "medium",
      relatedMotivations: related.length > 0 ? related : undefined,
    });
    rationale.push(
      `Primary confidence was ${(interpretation.confidence * 100).toFixed(
        0
      )}%, so the safety agent flags this as less reliable.`
    );
  }

  // 2) Strong discomfort motivation → highlight possible pain / health concerns.
  const discomfort = interpretation.rankedMotivations.find(
    (m) => m.motivation === "discomfort"
  );
  if (discomfort && discomfort.score >= 0.3) {
    issues.push({
      id: "discomfort_or_health_signals",
      description:
        "The interpretation suggests your dog may be uncomfortable or anxious. Consider monitoring for pain, stress, or health issues, especially if this repeats.",
      severity: discomfort.score >= 0.5 ? "high" : "medium",
      relatedMotivations: ["discomfort"],
    });
    rationale.push(
      `Discomfort motivation scored ${(discomfort.score * 100).toFixed(
        0
      )}%, so the safety agent highlights potential health or wellbeing concerns.`
    );
  }

  // 3) Simple keyword check for possible health-risk descriptions in the raw text.
  const healthKeywords = [
    "panting",
    "limping",
    "won't eat",
    "wont eat",
    "not eating",
    "vomit",
    "vomiting",
    "blood",
    "injured",
    "hurt",
    "collapse",
    "collapsed",
    "shaking",
    "lethargic",
  ];
  const matchedKeywords = healthKeywords.filter((k) => lower.includes(k));
  if (matchedKeywords.length > 0) {
    issues.push({
      id: "possible_health_keywords",
      description:
        `The scenario mentions possible health-related signs (${matchedKeywords.join(
          ", "
        )}). If this is unusual or persistent, consider consulting a vet rather than relying only on this interpreter.`,
      severity: "high",
      relatedMotivations: discomfort ? ["discomfort"] : undefined,
    });
    rationale.push(
      `Scenario text contains health-related keywords: ${matchedKeywords.join(", ")}.`
    );
  }

  if (issues.length === 0) {
    rationale.push(
      "No specific safety issues detected based on the current rules; treating this as a low-risk everyday scenario."
    );
    return {
      overallRisk: "low",
      safeToAct: true,
      issues: [],
      rationale,
    };
  }

  const overallRisk = highestSeverity(issues);
  const safeToAct = overallRisk !== "high";

  // If we raised issues but none were clearly health-related, add a generic caution note.
  if (!issues.some((i) => i.id === "possible_health_keywords")) {
    issues.push({
      id: "unclear_but_caution",
      description:
        "There are some uncertainties in this interpretation. Use your own judgement and monitor your dog rather than treating this as a definitive answer.",
      severity: overallRisk,
    });
  }

  return {
    overallRisk,
    safeToAct,
    issues,
    rationale,
  };
}

