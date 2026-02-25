"use client";

import React, { useState } from "react";
import { runDogInterpreter } from "../lib/interpreter";
import { validateScenario } from "../lib/inputGuard";
import type { InputGuardReason } from "../lib/inputGuard";
import type { DogInterpretation } from "../lib/types";

const REJECTED_MESSAGE: Record<InputGuardReason, string> = {
  empty: "Please describe what's happening — the scenario box is empty.",
  off_topic:
    "This doesn't look like a dog behaviour scenario. Describe what your dog is doing and we'll interpret it.",
  inappropriate: "Please describe your dog's behaviour in a respectful way.",
  spam: "That looks like repeated text. Try a short description of one moment with your dog.",
};

const EXAMPLE_SCENARIOS = [
  {
    label: "Food + whining",
    text: "He's staring at me while I eat toast and whining softly.",
  },
  {
    label: "Door + pacing",
    text: "He's pacing by the back door and sniffing the ground, it's 10pm.",
  },
  {
    label: "Play / excited",
    text: "She dropped into a play bow in the garden and keeps bouncing toward the ball.",
  },
  {
    label: "Restless at night",
    text: "He's been circling the couch and panting, won't settle. We skipped the evening walk.",
  },
  {
    label: "Whining for attention",
    text: "She keeps whining and pawing at my leg while I'm on a call.",
  },
  {
    label: "Bored, nothing to do",
    text: "He's been lying around sighing, nothing to do. No walk yet today.",
  },
  {
    label: "Anxious when alone",
    text: "When I get my keys she gets nervous and starts pacing by the door.",
  },
  {
    label: "Meal time",
    text: "It's dinner time and he's sitting by his bowl staring at me.",
  },
  {
    label: "Sniffing at the door",
    text: "She's sniffing along the bottom of the back door and won't leave it.",
  },
];

const CONFIDENCE_UNCLEAR_THRESHOLD = 0.5;

export default function Home() {
  const [scenario, setScenario] = useState("");
  const [result, setResult] = useState<DogInterpretation | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejectedReason, setRejectedReason] = useState<InputGuardReason | null>(null);

  async function handleInterpret() {
    const trimmed = scenario.trim();
    setRejectedReason(null);
    setResult(null);

    const guard = validateScenario(trimmed);
    if (!guard.allowed) {
      setRejectedReason(guard.reason);
      return;
    }

    setLoading(true);
    try {
      const interpretation = await runDogInterpreter(trimmed);
      setResult(interpretation);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Main column: input + output */}
      <main className="flex-1 p-6 md:p-8 flex flex-col gap-6 border-r border-neutral-200 dark:border-neutral-800" aria-label="Dog interpretation">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            🐶 Dog Interpreter Agent - to help you understand your four-footed friend!
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Describe a moment. Get a structured interpretation of what your dog is trying to tell you!
          </p>
        </header>

        <section className="flex flex-col gap-2" aria-labelledby="scenario-heading">
          <h2 id="scenario-heading" className="sr-only">
            Describe the scenario
          </h2>
          <label htmlFor="scenario" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            What’s happening?
          </label>
          <textarea
            id="scenario"
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value);
              if (rejectedReason) setRejectedReason(null);
            }}
            placeholder="e.g. He’s staring at me while I eat toast and whining softly."
            className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent focus-visible:ring-2 focus-visible:ring-amber-500"
            rows={4}
            aria-invalid={rejectedReason !== null}
            aria-describedby={rejectedReason ? "scenario-error" : undefined}
          />
          {rejectedReason !== null && (
            <p
              id="scenario-error"
              role="alert"
              className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md border border-amber-200 dark:border-amber-800"
            >
              {REJECTED_MESSAGE[rejectedReason]}
            </p>
          )}
          <button
            type="button"
            onClick={handleInterpret}
            disabled={loading}
            aria-label={loading ? "Interpreting scenario…" : "Run interpretation on the scenario above"}
            aria-busy={loading}
            className="self-start px-4 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:focus:ring-offset-neutral-900 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Interpreting…" : "Interpret"}
          </button>
        </section>

        <section
          className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 p-4 min-h-[120px]"
          aria-labelledby="result-heading"
          aria-live="polite"
          aria-atomic="true"
        >
          <h2 id="result-heading" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-2">
            Result
          </h2>
          {rejectedReason === null && !result && !loading && (
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              Run an interpretation to see ranked motivations, recommended action, and confidence here.
            </p>
          )}
          {result && (
            <div className="space-y-3 text-sm">
              <p className="text-neutral-700 dark:text-neutral-300">{result.summary}</p>
              <div>
                <h3 className="font-medium text-neutral-600 dark:text-neutral-400 mb-1">Likely motivations</h3>
                <ul className="list-disc list-inside space-y-0.5 text-neutral-600 dark:text-neutral-400">
                  {result.rankedMotivations.map((m) => (
                    <li key={m.motivation}>
                      <span className="font-mono text-neutral-500 dark:text-neutral-500">{m.motivation}</span>{" "}
                      ({m.score.toFixed(2)}) — {m.evidence.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
              <p>
                <span className="font-medium text-neutral-600 dark:text-neutral-400">Recommended action:</span>{" "}
                {result.recommendedHumanAction}
              </p>
              <p>
                <span className="font-medium text-neutral-600 dark:text-neutral-400">Confidence:</span>{" "}
                <span className={result.confidence < CONFIDENCE_UNCLEAR_THRESHOLD ? "text-amber-600 dark:text-amber-400" : ""}>
                  {(result.confidence * 100).toFixed(0)}%
                </span>
                {result.confidence < CONFIDENCE_UNCLEAR_THRESHOLD && (
                  <span className="block mt-1 text-amber-700 dark:text-amber-400 text-xs">
                    Interpretation is uncertain — consider adding more detail.
                  </span>
                )}
              </p>
            </div>
          )}
        </section>

        {/* Trace at bottom of main column */}
        <section className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-800/30 p-4" aria-labelledby="trace-heading">
          <h2 id="trace-heading" className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
            How this works
          </h2>
          {!result && (
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              After you interpret, this section shows how each score was calculated (the maths), the evidence from the modules, and the raw module outputs.
            </p>
          )}
          {result && (
            <div className="space-y-4 text-sm">
              {/* How this works: maths for each score, then confidence */}
              <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 p-3">
                <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
                  Score calculation
                </h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3">
                  Each motivation gets a raw score from the module signals (fixed weights per signal). Each addend in the formula is one such weight; the text in parentheses shows which signal it came from. Raw scores are then normalised (divided by the total) so all scores sum to 1.
                </p>
                <ul className="space-y-3 text-xs">
                  {result.rankedMotivations.map((m) => (
                    <li key={m.motivation} className="flex flex-col gap-1">
                      <span className="font-mono font-medium text-neutral-700 dark:text-neutral-300">
                        {m.motivation} ({(m.score * 100).toFixed(0)}%)
                      </span>
                      {m.calculation && (
                        <code className="block text-[11px] text-neutral-600 dark:text-neutral-400 bg-white/60 dark:bg-neutral-800/60 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-600 break-all">
                          {m.calculation}
                        </code>
                      )}
                      {m.evidence.length > 0 && (
                        <span className="text-neutral-600 dark:text-neutral-400">
                          Evidence: {m.evidence.join("; ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {result.confidenceExplanation && (
                  <p className="mt-3 pt-2 border-t border-amber-200 dark:border-amber-800 text-xs text-neutral-600 dark:text-neutral-400">
                    {result.confidenceExplanation}
                  </p>
                )}
              </div>
              {/* Raw module outputs (what each tool returned) */}
              <div>
                <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                  Module outputs (inputs to scoring)
                </h3>
                <ul className="space-y-3">
                  {result.trace.map((activation) => (
                    <li
                      key={activation.module}
                      className="rounded-md border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-2"
                    >
                      <span className="font-mono font-medium text-neutral-600 dark:text-neutral-400">
                        {activation.module}
                      </span>
                      <pre className="mt-1 text-xs text-neutral-600 dark:text-neutral-400 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(activation.output, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Side panel: try an example — fixed height on desktop so the list scrolls inside */}
      <aside className="w-full md:w-80 lg:w-96 md:h-screen md:max-h-screen md:overflow-hidden p-6 md:p-8 bg-neutral-100 dark:bg-neutral-900/50 flex flex-col min-h-0" aria-labelledby="examples-heading">
        <h2 id="examples-heading" className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2 shrink-0">
          Try an example scenario
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-500 mb-3 shrink-0">
          Click &quot;Use this&quot; to paste a scenario into the box and run an interpretation.
        </p>
        <ul className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          {EXAMPLE_SCENARIOS.map((ex) => (
            <li
              key={ex.label}
              className="flex flex-col gap-2 rounded-md border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-800/50 p-3"
            >
              <p className="text-sm text-neutral-700 dark:text-neutral-300 min-w-0">
                <span className="font-medium text-neutral-500 dark:text-neutral-400">{ex.label}:</span>{" "}
                {ex.text}
              </p>
              <button
                type="button"
                onClick={() => setScenario(ex.text)}
                aria-label={`Use example: ${ex.label}. Fills the scenario box above.`}
                className="shrink-0 w-fit px-3 py-1.5 text-sm rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Use this
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
