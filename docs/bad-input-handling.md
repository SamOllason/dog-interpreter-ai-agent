# Plan: Handling bad input (browser, mocked)

This app is browser-based and mocked for now. We still want to **ignore or deflect** silly messages, rude words, and clearly off-topic input so the product stays focused and safe. This document is the plan; implementation can be phased.

---

## Goals

- **Don't feed junk into the interpreter** — avoid running modules on abuse, jokes, or "what is 2+2".
- **No drama, no echo** — when we reject input, show a single friendly message. Never repeat or highlight the user's words.
- **Keep the door open** — same contract for a mock today and a real moderator/LLM later.

---

## What counts as "bad" (for the plan)

| Category | Examples | Why handle |
|----------|----------|------------|
| **Rude / abusive** | Profanity, insults, hate speech | Safety and product tone. |
| **Clearly off-topic** | "What's 2+2?", "Write me a poem", "Hello world" | Not a dog scenario; interpreter would be noise. |
| **Silly / joke** | "My dog is a quantum computer", obvious troll | Keep the product intent clear without over-moderating. |
| **Spam / repeat** | Same pasted block many times, or pure repetition | Wastes "interpret" and clutters the idea of the app. |
| **Empty / whitespace** | *(already handled)* | UI already blocks and shows "describe what's happening". |

We are **not** trying to catch every edge case in Phase 1. We want a small, mock-friendly guard that can be swapped for something stronger later.

---

## Where it lives in the flow

- **Before** `runDogInterpreter`: input goes through a **guard** first.
- If the guard says **reject**: do **not** call the orchestrator; do not store the raw input in trace. Show one short, friendly message in the UI.
- If the guard says **allow**: pass the (trimmed) string to `runDogInterpreter` as today.

So the pipeline is:

```
User input → trim → [Input guard] → if allowed → runDogInterpreter → Result + Trace
                         ↓
                    if rejected → show friendly message only (no interpretation)
```

---

## Contract: input guard (mock-friendly, swappable)

Keep a single, simple contract so the UI and orchestrator don't care whether the guard is a mock or a real API.

**Suggested shape:**

```ts
// e.g. in lib/inputGuard.ts or lib/validation.ts

export type InputGuardResult =
  | { allowed: true }
  | { allowed: false; reason: "empty" | "off_topic" | "inappropriate" | "spam" };

export function validateScenario(input: string): InputGuardResult;
```

- **`allowed: true`** — UI calls `runDogInterpreter(trimmed)` and shows result + trace as today.
- **`allowed: false`** — UI does **not** call the orchestrator. It shows a single message based on `reason`, and does **not** echo or display the user's input.

**Reasons** can be mapped to copy like:

- `empty` → "Please describe what's happening — the scenario box is empty." *(already in UI)*
- `off_topic` → "This doesn't look like a dog behaviour scenario. Describe what your dog is doing and we'll interpret it."
- `inappropriate` → "Please describe your dog's behaviour in a respectful way."
- `spam` → "That looks like repeated text. Try a short description of one moment with your dog."

One sentence per reason; no listing of "what was wrong" and no repetition of the input.

---

## Mock implementation (browser-only, no backend)

All logic can live in the client for now: a small module that returns `InputGuardResult` using only the string.

1. **Empty**  
   - Already handled in UI (trim and block before calling guard if you prefer). Alternatively the guard can return `allowed: false, reason: "empty"` for empty/whitespace so one place owns "rejected".

2. **Rude / inappropriate**  
   - **Blocklist**: a small list of words/phrases (normalized: lowercased, maybe strip punctuation). If the input contains a blocklisted token, return `allowed: false, reason: "inappropriate"`.  
   - Keep the list in a separate, easy-to-edit module or config (e.g. `lib/inputGuardBlocklist.ts`). No need to be exhaustive; aim for "obvious bad" only.

3. **Off-topic / silly**  
   - **Heuristics** (mock): e.g. "does the input look like it could be about a dog?"  
   - Simple version: require at least one "dog-related" keyword (dog, puppy, he/she for dog, bowl, walk, door, tail, whine, bark, etc.) and a minimum length (e.g. 10–15 chars). If it has none of the keywords and is short, return `off_topic`.  
   - Slightly stronger: if it contains strong "not a scenario" signals (e.g. "2+2", "write a poem", "hello world"), return `off_topic`.  
   - Keep logic in one place (e.g. `validateScenario`) so we can replace it later with an LLM or moderation API that still returns `InputGuardResult`.

4. **Spam / repeat**  
   - Optional for mock: e.g. "same character repeated more than N times" or "first 20 chars repeated 3+ times". If you want to keep the first version minimal, you can skip spam and add it when you have real traffic.

**Important:** Do **not** log or store the raw rejected input in the UI or in the trace. You can log "input rejected, reason: inappropriate" for debugging if needed, but avoid storing the actual text.

---

## UX in the UI

- Reuse the same **error/feedback area** you use for empty input (e.g. above or near the Result section, or in place of Result when rejected).
- When guard returns `allowed: false`:
  - Set a small state, e.g. `rejectedReason: InputGuardResult["reason"] | null` (only when `allowed === false`).
  - Show **one** message based on `reason` (see copy above).
  - Do **not** run the interpreter; do **not** show a result or trace for that submit.
- When the user edits the input again, clear `rejectedReason` (same as you clear empty-input error on type).
- Keep **focus** and **keyboard** behaviour: after submit, focus can stay on the button or move to the message region; ensure the message is in the tab order and readable by screen readers (e.g. `role="alert"` and `aria-live` if it appears dynamically).

---

## Where in the codebase

- **`lib/inputGuard.ts`** (or `lib/validation.ts`): `validateScenario(input: string): InputGuardResult`, plus any blocklist/heuristics.
- **Blocklist**: either inside that file or in `lib/inputGuardBlocklist.ts` (or similar) so it's easy to update without touching logic.
- **UI** (`app/page.tsx`): in `handleInterpret`, after trimming:
  1. Call `validateScenario(trimmed)`.
  2. If `!result.allowed`, set `rejectedReason` (or equivalent), clear result/trace, return.
  3. Else call `runDogInterpreter(trimmed)` and show result + trace as today.

No changes to `runDogInterpreter` or to module contracts: the orchestrator only ever sees input that passed the guard.

---

## Later: real moderation or LLM

- **Same contract**: `validateScenario` can later call an API or a small "classifier" LLM that returns `{ allowed, reason? }`. UI and orchestrator stay unchanged.
- **Optional**: if you add a "rejected" entry in the trace (e.g. for analytics), it should only record "input rejected, reason: X", not the raw input, to avoid storing abuse or PII.

---

## Summary

| Item | Choice |
|------|--------|
| **When** | Before `runDogInterpreter`; guard runs in UI before any orchestrator call. |
| **Contract** | `validateScenario(input) → { allowed, reason? }`; UI shows one message per reason, never echoes input. |
| **Mock** | Blocklist for inappropriate; simple keyword + length for off-topic; optional spam heuristic. All in-browser. |
| **UX** | Single friendly sentence per rejection; clear error state; clear on type. |
| **Future** | Swap guard implementation for API/LLM; keep `InputGuardResult` and UI behaviour the same. |

This keeps the app focused on dog behaviour, avoids giving rude or silly input to the interpreter, and stays compatible with stronger moderation later.
