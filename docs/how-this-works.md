# How this works (Phase 1)

This document describes the **Phase 1** architecture of the **Dog Interpreter**: a deterministic orchestration layer that activates mocked "modules" (tools), aggregates structured signals, scores motivations, and returns a single typed `DogInterpretation` object that drives the UI.

**This repo is a learning tool.** It's meant to help people — especially those new to AI agents — see how agents are built: what a "tool" is, how an orchestrator works, and why structure and trace matter. Use this doc and the code together; the FAQs below answer the kinds of questions that come up when you're new to this.

## Goals (Phase 1)

- **Deterministic orchestration** around scenario input
- **Explicit module activation** (never implied)
- **Structured outputs only** — UI renders from typed `DogInterpretation` (no raw text)
- **Traceability** via a `trace: ModuleActivation[]` (which modules ran, input/output)

## Key Components

- **UI (Next.js / React / Tailwind)**: scenario input, renders ranked motivations, recommended action, confidence, and trace panel
- **Orchestrator (`runDogInterpreter`)**: activates modules, collects signals, runs scoring + normalization, builds `DogInterpretation` (including `trace` and `confidence`)
- **Modules (mocked tools)**: `foodContext`, `bodyLanguage`, `rewardMemory`, `emotionState`, `timeContext`, `weatherContext` — each returns structured signal flags (`weatherContext` is async and mimics a temperature/weather API; see [next-steps-chaining-and-api.md](next-steps-chaining-and-api.md))
- **Types**: `ModuleName`, `Motivation`, `ModuleActivation`, `MotivationScore`, `DogInterpretation` (see README)

## Architecture Diagram

```mermaid
flowchart TD
  U[User] --> UI[Web UI]
  UI --> S[Supervisor agent]
  S --> O[runDogInterpreter]

  subgraph Modules
    FC[foodContext]
    BL[bodyLanguage]
    RM[rewardMemory]
    ES[emotionState]
    TC[timeContext]
    WC[weatherContext]
  end

  subgraph LLM
    L[LLM inside tools]
  end

  O --> FC
  O --> BL
  O --> RM
  O --> ES
  O --> TC
  O --> WC

  Modules -.-> L

  FC --> O
  BL --> O
  RM --> O
  ES --> O
  TC --> O
  WC --> O

  O --> S
  S --> UI
  UI --> U
```



The *LLM sits inside each module/tool*, not in the orchestrator. You keep the same function signature (e.g. `bodyLanguage(input: string) => BodyLanguageOutput`). Today that's keyword rules; later you call an LLM with a prompt like "From this scenario, extract body-language signals: staring, pacing, doorFocus, whining, tailUp, sniffing. Return JSON." The orchestrator stays deterministic and never sees raw model output — only the structured result.

## Data Flow (High Level)

1. **Scenario input** enters the UI as a single text string.
2. *(Optional)* UI runs an **input guard** (see [bad-input-handling.md](bad-input-handling.md)): reject empty, rude, or clearly off-topic input; show a single friendly message without echoing the input. If allowed, continue.
3. UI calls `**runDogInterpreter(input)*`*.
4. Orchestrator:
  - **Activates all Phase 1 modules** (all six tools), passes input to each.
  - **Collects structured outputs**; records each as `ModuleActivation { module, input, output }` in `trace`.
  - **Maps signals → motivation weights**; normalizes so scores sum ~1.
  - **Computes confidence** (e.g. agreement across modules, gap between top and #2).
  - Builds `**DogInterpretation`**: `summary`, `rankedMotivations` (with `evidence`), `recommendedHumanAction`, `confidence`, `trace`.
5. UI renders:
  - **Ranked motivations** (motivation + score + evidence)
  - **Recommended action**
  - **Confidence** (always visible)
  - **Trace panel**: modules called + their input/output

## Multi-agent extension: primary interpreter + safety agent

Phase 1 now includes a **second agent** in addition to the primary orchestrator: a safety/critic pass that reviews the primary result and surfaces a separate, structured safety view.

At a code level this is modelled as:

- **Primary agent**: `runDogInterpreter(input) => DogInterpretation`
- **Safety agent**: `runSafetyReview(input, interpretation) => SafetyReview`
- **Wrapper orchestrator**: `runDogInterpreterWithSafety(input) => { primary, safety }`

The UI then renders **both** the primary interpretation and the safety review, so you can see how multi-agent oversight works end-to-end.

```mermaid
flowchart TD
  U[User]
  UI[Next.js UI / React + TS + Tailwind]
  P[Primary agent: runDogInterpreter]
  S[Safety agent: runSafetyReview]

  U -->|describes scenario| UI
  UI -->|input string| P
  P -->|DogInterpretation structured result| S
  S -->|SafetyReview structured review| UI
  UI -->|motivations + action + confidence + trace + safety review| U
```



**Why a separate agent instead of “one more step”?**

- The **primary agent** is optimised for *best guess what the dog wants*.
- The **safety agent** is optimised for *is this safe / should we be cautious?* and can disagree with or veto the first agent.
- Keeping them separate gives you:
  - A **second, independently-testable contract** (`SafetyReview`) with its own rules and evals.
  - Clear **traceability**: you can see what the primary agent said, then what the safety agent concluded and why.
  - A pattern you can generalise to production: “two‑person rule” style oversight where a critic/safety agent has a different prompt, tools, or even model.

## Where an actual LLM would fit

- *Inside each tool, not in the orchestrator.* The orchestrator stays pure logic: call tools, aggregate, score, return a typed object. It never parses free text from a model.
- *Each module keeps the same contract:* `(input: string) => StructuredOutput`. For `bodyLanguage`, you'd send the scenario to an LLM with a system prompt that defines the JSON shape (e.g. `{ staring, pacing, doorFocus, whining, tailUp, sniffing }`). You validate the response (e.g. with Zod) and return it. The rest of the pipeline is unchanged.
- *Optional: one LLM for "routing".* A more advanced setup could use a first LLM call to decide *which* tools to invoke (e.g. "no food mentioned → skip foodContext"). The orchestrator would still call only those tools and then run the same scoring logic. Tool selection becomes data (e.g. `["bodyLanguage", "emotionState"]`) instead of "call all six".
- *Summary and recommended action* could stay rule-based (as now) or be generated by an LLM from the ranked motivations + evidence, again with a strict schema so the UI still receives a `DogInterpretation`, not raw text.

## How this gets more advanced: tools and flows

This sample uses **one-shot, all-tools-called** flow. Real agent systems often add:

1. **Tools = same modules, different implementations**
  - Each "module" is a **tool**: same name, same input/output contract. Phase 1: keyword rules. Later: LLM extraction, or an external API (e.g. image model for "what's in this photo?"), or a RAG lookup. The orchestrator only sees the structured result; it doesn't care how the tool was implemented.
2. **Selective tool use (dynamic routing)**
  - Instead of "always run all six modules", the orchestrator (or a small "planner" LLM) decides *which* tools to call for this input. Example: user says "she's whining by the door" → call `bodyLanguage`, `emotionState`, `rewardMemory`; maybe skip `foodContext`. Fewer calls = cheaper and faster, and the trace still shows exactly which tools ran.
3. **Chained tools**
  - One tool's output can be another tool's input. Example: `bodyLanguage(scenario)` returns signals; a second tool "recommend_action(motivations, signals)" takes that plus the ranked motivations and returns the recommended action string. The orchestrator runs the chain and records each step in the trace. **In this repo:** `weatherContext` demonstrates an async, API-like tool that internally chains "extract location from scenario" → "call weather API"; see [next-steps-chaining-and-api.md](next-steps-chaining-and-api.md).
4. **Supervisor / ReAct-style loop**
  - A "supervisor" LLM repeatedly decides: "call tool X" or "I have enough, return final answer". It calls tools, gets back structured results, and either loops or formats a final response. Our pipeline is a single round (orchestrator → all tools → aggregate); a supervisor adds multiple rounds and dynamic tool choice. The **trace** is the same idea: log every tool call and result so the flow is inspectable.
5. **Structured outputs everywhere**
  - No matter how many LLMs you add, every tool and the final answer should return **typed, validated** data (e.g. Zod schemas). That keeps the UI, logging, and guardrails (e.g. "don't show action if confidence < 0.5") simple and reliable.

So: this sample gives you the **orchestrator + tool contracts + trace + confidence** pattern. Making it "more advanced" means swapping tool implementations (e.g. LLM inside each module), optionally adding routing or a supervisor, and keeping the same structured-output and trace discipline.

### Dynamic tool routing (selective tool use)

In Phase 1 the orchestrator always calls **all** scenario-based modules. A more agentic version inserts a small **router** between the UI and the orchestrator that decides *which* tools to run for this input.

```mermaid
flowchart TD
  U[User] -->|scenario text| UI["UI"]
  UI --> R["Router / Planner (lightweight)"]

  subgraph ALL["All available tools"]
    FC[foodContext]
    BL[bodyLanguage]
    RM[rewardMemory]
    ES[emotionState]
    TC[timeContext]
    WC[weatherContext]
  end

  R -->|tool plan: [BL, ES, RM]| O["Orchestrator (runDogInterpreter)"]
  O -->|calls only selected tools| FC
  O --> BL
  O --> ES
  O --> RM
  O --> TC
  O --> WC

  O -->|DogInterpretation + trace (which tools actually ran)| UI
  UI --> U
```

The router can start as simple rules (`if no food words → skip foodContext`) and later become a small LLM that outputs a list of tool names. The trace stays the same idea, but now **"which tools ran"** is itself a decision you can inspect and evaluate.

### Short-term memory and multi-turn interaction

Right now each interpretation is **stateless**: the agent forgets previous runs. To support richer UX (clarifying questions, follow-ups like "what if I ignore him?"), you add a small **conversation state** that the agent reads and updates on every turn.

```mermaid
sequenceDiagram
  participant U as User
  participant UI as UI
  participant A as Dog Agent
  participant M as Short-term Memory

  U->>UI: Scenario turn 1
  UI->>M: load conversation state
  UI->>A: runAgent with input and state
  A->>A: call tools and interpreter
  A->>M: write interpretation and key flags
  A->>UI: DogInterpretation maybe with question
  UI->>U: show result

  U->>UI: Follow-up answer turn 2
  UI->>M: load updated state
  UI->>A: runAgent with new input and state
  A->>A: reuse prior info like just ate
  A->>M: update state again
  A->>UI: new DogInterpretation
  UI->>U: show updated result
```

Implementation-wise this can be as simple as a JS object in memory (per session) containing recent `DogInterpretation`s and a few booleans; the key idea is that **state becomes an explicit input/output** of the agent loop.

### Supervisor / ReAct-style loop

A ReAct-style agent adds a **supervisor** that decides, step by step, whether to call a tool, ask a question, or finish. The orchestrator and tools stay the same; what changes is that a loop controls *when* and *why* they are called.

```mermaid
flowchart TD
  U[User] -->|scenario and answers| UI[UI]
  UI --> S[Supervisor planner LLM]

  subgraph Tools
    DIR[runDogInterpreter]
    Q[Ask clarifying question]
  end

  S -->|plan call interpreter| DIR
  DIR -->|DogInterpretation and trace| S

  S -->|plan ask question| Q
  Q -->|question text| UI
  UI -->|user answer| S

  S -->|plan return final answer| UI
  UI -->|result motivations action confidence trace of steps| U
```

Each iteration, the supervisor sees the **history of steps so far** (tools used, their outputs, any user answers) and decides the next action. This is the pattern most "agentic" applications use in production: a loop of **(plan → act → observe)** backed by the same kind of tools and trace you already have in Phase 1.

### How this compares to LangChain

- **What LangChain is**: a framework (Python/TS) for wiring LLMs, tools, vector stores, and agents together into reusable "chains" with tracing and evals.
- **What this repo already does similarly**: explicit tools/modules with clear contracts, a deterministic orchestrator, structured outputs only, a visible trace, and a tiny eval runner. Those are the core ideas LangChain promotes, just implemented by hand in plain TypeScript.
- **Gaps vs a full LangChain stack**: no built‑in integrations (vector DBs, tracing backends, hosted evals), no generic agent loop/graph editor, and no batteries‑included patterns for things like memory, RAG, or multi‑tenant configuration.
- **What LangChain would add on top**: ready‑made primitives for LLM calls and tool routing, off‑the‑shelf agents/chains, standardised tracing (e.g. LangSmith), evaluation tooling, and integrations so you can swap in external systems (databases, search, observability) without rebuilding that plumbing yourself.

### Evaluating different hypotheses with a tiny eval runner

Unit tests in this repo lock in the contracts and behaviour of `runDogInterpreter` and the modules. When you start exploring **different hypotheses** (e.g. alternative scoring rules, different tool-routing strategies, or future LLM-backed module implementations), it helps to add a small, repeatable **eval** on top.

This repo includes a small sample eval runner in `lib/evalRunner.ts`:

- **Fixed labeled scenarios**: a small `EXAMPLES` array of scenario strings with an expected top motivation label
- **Single metric**: it calls `runDogInterpreter` for each scenario and reports how often the **top-ranked motivation** matches the expected label, plus confidence for each run

It is intentionally minimal, but follows the same pattern you would use in a production agent:

- Keep a **frozen eval set** of scenarios and labels
- Run multiple **implementation variants** (scoring tweaks, routing logic, tool internals) against the same set
- Compare them on simple metrics (e.g. top-1 accuracy, distribution of confidence) before shipping changes

From here you can expand the eval to support more scenarios, richer labels (e.g. acceptable actions), or multiple runs per scenario when you introduce stochastic tools (like LLM-backed modules).

## Phase 1 Constraints (Intentional)

- **No external APIs**; all modules are mocked (keyword rules or fixed outputs; `weatherContext` mimics an API with delay + typed response).
- **No RAG / vector DB / LangChain**
- **No persistence, auth, deployment**
- **Type safety**: no `any`; UI driven only by `DogInterpretation`

---

## FAQs (for people new to AI agents)

### What is a "tool"?

A **tool** is a small, single-purpose function that the agent (or orchestrator) can call. It takes a defined input and returns a **structured** output — not a paragraph of text, but something the rest of the system can use (e.g. a list of booleans, a label, a number).

**Example in this project:** The `bodyLanguage` tool takes the user's scenario string (e.g. *"He's pacing by the door and whining"*) and returns an object like:

```json
{ "staring": false, "pacing": true, "doorFocus": true, "whining": true, "tailUp": false, "sniffing": false }
```

The orchestrator doesn't care *how* that object was produced (keyword rules today, an LLM tomorrow). It only cares that it gets that shape back so it can combine it with other tools and score motivations. So: **a tool = a named function with a clear input/output contract.** The agent "uses" tools by calling them and then deciding what to do with the results.

### What is an "orchestrator"?

The **orchestrator** is the part that decides what to run and in what order, then combines the results. In this project it's `runDogInterpreter`: it calls every tool once with the same scenario string, collects all the structured outputs, runs scoring logic (e.g. "door + pacing + night → toilet_needed"), and returns one final object (summary, ranked motivations, recommended action, confidence, trace). It never talks to an LLM directly; it only calls tools and does math. So the "brain" that coordinates things is deterministic code; the *tools* are where you'd plug in an LLM or an API later.

### What is the "trace" and why does it matter?

The **trace** is a log of every tool the orchestrator called, plus the input and output for each. In the UI you see it as "Trace" (e.g. `bodyLanguage` → `{ pacing: true, doorFocus: true }`). It matters because (1) you can debug why the system said what it said, (2) you can show the user "here's what we looked at," and (3) in real products, audits and safety reviews need to see exactly what ran. Agents that don't expose a trace are harder to trust and harder to fix.

With the safety extension, there are **two layers of traceability**:

1. **Primary agent trace** – which modules ran (`foodContext`, `bodyLanguage`, `timeContext`, `weatherContext`, etc.), their inputs/outputs, and how their signals contributed to each motivation score (shown as maths in the UI).
2. **Safety agent explanation** – a separate, structured `SafetyReview` that says:
  - overall risk (`low` / `medium` / `high`)
  - whether it considers the recommendation safe to act on
  - which rules fired (e.g. “low_confidence_primary”, “discomfort_or_health_signals”, “possible_health_keywords”)
  - short rationale lines explaining how it decided

The UI surfaces both, so you can audit *what the system did* and *how the safety layer evaluated it*, instead of trusting a single opaque answer.

### What's the difference between "tools" and "an LLM"?

An **LLM** (large language model) is a single big model that generates text (or structured output if you prompt it carefully). A **tool** is a function you define: input in, structured output out. In many agent designs, *each tool might call an LLM inside it* — for example, `bodyLanguage(scenario)` could send the scenario to an LLM with the prompt "Extract body-language signals and return JSON." So: the LLM does the heavy lifting *inside* the tool; the orchestrator only sees the tool's return value. That keeps the rest of the system simple and testable. In this project we don't use a real LLM; we use keyword rules inside each tool to mimic that pattern.

### How do I know where to add a new tool?

Ask: "Is there a distinct kind of signal or lookup that the system needs, with a clear input and output?" Examples: "What time of day is it?" → `timeContext`. "Is food involved?" → `foodContext`. "What's the dog's body language?" → `bodyLanguage`. Each of those is one tool. You add it by (1) defining its output type, (2) implementing a function that returns that type, (3) registering it in the orchestrator's list of tools, and (4) using its output in your scoring or logic. The README's [Learning: Adding a new tool](../README.md#learning-adding-a-new-tool) section walks through this with `timeContext`.