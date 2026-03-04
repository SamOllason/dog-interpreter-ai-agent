import { z } from "zod";
import type {
  DogInterpreterMultiAgentResult,
  SupervisorAction,
  SupervisorStep,
  SupervisorTrace,
} from "./types";
import { runDogInterpreterWithSafety } from "./interpreter";
import { getClarifyingQuestion } from "./clarifyingQuestion";

const SupervisorDecisionSchema = z.object({
  action: z.enum(["finish", "ask_clarifying_question"]),
  reason: z.string(),
});

const SUPERVISOR_SYSTEM_PROMPT = `
You are a supervisor planner for a small dog-behaviour interpreter.

You see:
- the user's scenario,
- the primary agent's structured interpretation (summary, motivations, confidence),
- a short safety review.

Your job is to decide the NEXT ACTION in a short plan.

Valid actions:
- "finish" – the current interpretation is good enough to return.
- "ask_clarifying_question" – the agent should surface ONE short, concrete clarifying question to the user before they run it again.

Return a SINGLE JSON object with:
{
  "action": "finish" | "ask_clarifying_question",
  "reason": "short explanation of why you chose this action"
}

Be conservative: only ask a clarifying question when confidence is low OR motivations are ambiguous. Otherwise, prefer "finish".
Do not include any extra fields or commentary.
`;

export async function runPlannerWithSupervisor(
  input: string
): Promise<DogInterpreterMultiAgentResult> {
  // Step 1: run the existing primary + safety agents once.
  const base = await runDogInterpreterWithSafety(input);
  const clarifyingCandidate = getClarifyingQuestion(base.primary);

  const steps: SupervisorStep[] = [
    {
      step: 1,
      action: "call_interpreter",
      reason: "Initial call to primary interpreter and safety agent.",
    },
  ];

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.SUPERVISOR_MODEL ?? "gpt-4o-mini";

  // Fast path: if confidence is already high, don't bother using the LLM.
  if (!apiKey || base.primary.confidence >= 0.7) {
    steps.push({
      step: 2,
      action: "finish",
      reason: apiKey
        ? "Primary confidence is high; no clarifying question needed."
        : "No supervisor LLM configured; defaulting to finish after one interpreter pass.",
    });

    return {
      ...base,
      supervisor: { steps },
      clarifyingQuestion: null,
    };
  }

  // Step 2: ask the supervisor LLM what to do next.
  const top = base.primary.rankedMotivations[0];
  const second = base.primary.rankedMotivations[1];

  const userContent = JSON.stringify(
    {
      scenario: input,
      primary: {
        summary: base.primary.summary,
        topMotivation: top?.motivation,
        secondMotivation: second?.motivation,
        motivations: base.primary.rankedMotivations.map((m) => ({
          motivation: m.motivation,
          score: m.score,
        })),
        confidence: base.primary.confidence,
      },
      safety: {
        overallRisk: base.safety.overallRisk,
        safeToAct: base.safety.safeToAct,
      },
    },
    null,
    2
  );

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SUPERVISOR_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    steps.push({
      step: 2,
      action: "finish",
      reason: `Supervisor LLM call failed with status ${res.status}; returning base interpretation.`,
    });
    return {
      ...base,
      supervisor: { steps },
      clarifyingQuestion: null,
    };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    steps.push({
      step: 2,
      action: "finish",
      reason: "Supervisor LLM returned no content; returning base interpretation.",
    });
    return {
      ...base,
      supervisor: { steps },
      clarifyingQuestion: null,
    };
  }

  let decisionJson: unknown;
  try {
    decisionJson = JSON.parse(content);
  } catch {
    steps.push({
      step: 2,
      action: "finish",
      reason: "Supervisor LLM response was not valid JSON; returning base interpretation.",
    });
    return {
      ...base,
      supervisor: { steps },
      clarifyingQuestion: null,
    };
  }

  const parsed = SupervisorDecisionSchema.safeParse(decisionJson);
  if (!parsed.success) {
    steps.push({
      step: 2,
      action: "finish",
      reason: "Supervisor LLM JSON did not match expected schema; returning base interpretation.",
    });
    return {
      ...base,
      supervisor: { steps },
      clarifyingQuestion: null,
    };
  }

  const { action, reason } = parsed.data;
  const mappedAction: SupervisorAction =
    clarifyingCandidate || action === "ask_clarifying_question"
      ? "ask_clarifying_question"
      : "finish";

  steps.push({
    step: 2,
    action: mappedAction,
    reason,
  });

  if (mappedAction === "ask_clarifying_question") {
    const question = clarifyingCandidate ?? getClarifyingQuestion(base.primary);
    return {
      ...base,
      supervisor: { steps },
      clarifyingQuestion: question ?? null,
    };
  }

  return {
    ...base,
    supervisor: { steps },
    clarifyingQuestion: null,
  };
}

