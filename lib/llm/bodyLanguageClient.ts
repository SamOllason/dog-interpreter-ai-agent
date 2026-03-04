import { z } from "zod";
import type { BodyLanguageOutput } from "../modules";

/**
 * Zod schema matching BodyLanguageOutput.
 * This is the contract the LLM must satisfy.
 */
const BodyLanguageSchema = z.object({
  staring: z.boolean(),
  pacing: z.boolean(),
  doorFocus: z.boolean(),
  whining: z.boolean(),
  tailUp: z.boolean(),
  sniffing: z.boolean(),
});

const SYSTEM_PROMPT = `
You are a helper that extracts dog body-language signals from a short scenario
description. You MUST respond with a single JSON object and nothing else.

The JSON object must have exactly these boolean fields:
- "staring"
- "pacing"
- "doorFocus"
- "whining"
- "tailUp"
- "sniffing"

Interpret the scenario realistically but conservatively. If a signal is not
clearly implied, set it to false. Do not include any extra keys or text.
`;

/**
 * inferBodyLanguageSignals
 *
 * OpenAI-backed implementation:
 * - sends the scenario string to the Chat Completions API,
 * - asks for JSON matching BodyLanguageOutput,
 * - validates with Zod before returning.
 */
export async function inferBodyLanguageSignals(
  scenario: string
): Promise<BodyLanguageOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = process.env.BODY_LANGUAGE_MODEL ?? "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: scenario },
      ],
      // Ask the model to format its response as a single JSON object.
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI body-language call failed with status ${res.status}.`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content for body-language extraction.");
  }
  console.log("content", content);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new Error("OpenAI body-language response was not valid JSON.");
  }

  const parsed = BodyLanguageSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error("OpenAI body-language JSON did not match expected schema.");
  }

  return parsed.data;
}


