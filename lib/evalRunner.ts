// NOTE: This file is intentionally written in a CommonJS-friendly style so it
// can be run with `node -r ts-node/register` without tripping ESM loaders.
// We keep it very small and don't lean on TypeScript types here.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runDogInterpreter } = require("./interpreter");

type LabeledExample = {
  id: string;
  scenario: string;
  expectedTopMotivation: string;
};

// LEARNING: This is a tiny "eval runner" – not a full test suite.
// It runs a few labeled scenarios through the interpreter and reports
// how often the top-ranked motivation matches the expected label.
const EXAMPLES: LabeledExample[] = [
  {
    id: "food-1",
    scenario: "He's staring at me while I eat toast and whining softly.",
    expectedTopMotivation: "food_request",
  },
  {
    id: "toilet-1",
    scenario: "She's pacing by the back door and sniffing the ground, it's 10pm.",
    expectedTopMotivation: "toilet_needed",
  },
  {
    id: "attention-1",
    scenario: "He's whining at me even though his bowl is empty and we just went outside.",
    expectedTopMotivation: "attention_seeking",
  },
];

async function runEval(): Promise<void> {
  let correctTop = 0;

  console.log("Dog Interpreter eval (toy) – top motivation accuracy\n");

  for (const example of EXAMPLES) {
    const result = await runDogInterpreter(example.scenario);
    const top = result.rankedMotivations[0]?.motivation;
    const ok = top === example.expectedTopMotivation;

    if (ok) correctTop += 1;

    console.log(
      [
        `id: ${example.id}`,
        `scenario: "${example.scenario}"`,
        `expectedTop: ${example.expectedTopMotivation}`,
        `gotTop: ${top ?? "none"}`,
        `match: ${ok ? "✅" : "❌"}`,
        `confidence: ${Math.round(result.confidence * 100)}%`,
      ].join(" | ")
    );
  }

  const total = EXAMPLES.length;
  const accuracy = total > 0 ? correctTop / total : 0;

  console.log("\nSummary");
  console.log(`Examples: ${total}`);
  console.log(`Top-motivation accuracy: ${(accuracy * 100).toFixed(1)}% (${correctTop}/${total})`);
}

if (require.main === module) {
  // eslint-disable-next-line no-void
  void runEval();
}

module.exports = { runEval };

