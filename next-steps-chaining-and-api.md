# Next steps: chaining tools and a mocked external API

This doc describes how to go beyond “one-shot, all tools with the same input” and add **(1) an async, API-like tool** and **(2) chaining** (one tool’s output as another’s input). We use a **weather / temperature** idea as a pseudo-realistic example: it’s a well-understood “external” service, easy to mock, and relevant to dog behaviour (hot day → panting might be thermal; cold + door → toilet).

---

## Goal

- **Async “API” tool** — A tool that returns a `Promise` and simulates a network call (delay + structured response). Same contract as other tools from the orchestrator’s point of view: input in, typed output out.
- **Chaining** — One tool’s output is another tool’s input. Example: “where is the dog?” → location; “what’s the weather there?” → temperature/conditions. The trace shows both steps.

---

## Example: weather / temperature “API”

**Why weather?**

- Familiar: everyone knows a “temperature API” or “weather service”.
- Relevant: hot day + panting → discomfort (thermal); cold + door focus → toilet; nice day + restlessness → maybe boredom.
- Easy to mock: no real API key; return `{ tempC, conditions, isHot, isCold }` after a short delay.
- Easy to swap later: replace the mock with e.g. [Open-Meteo](https://open-meteo.com/) (no key required) or any weather API.

**Contract (typed output):**

```ts
interface WeatherContextOutput {
  tempC: number;
  conditions: string;   // "sunny" | "cloudy" | "rainy" etc.
  isHot: boolean;       // e.g. tempC >= 28
  isCold: boolean;      // e.g. tempC <= 10
  locationUsed: string; // for trace: "home" | "garden" | "outside" etc.
}
```

**Mock implementation:**

1. **Input:** The tool receives the scenario string (same as other tools).
2. **Chain (inside the tool):**  
   - Step A: extract “location” from scenario (keywords: “garden”, “outside”, “park”, “walk” → that location; else `"home"`).  
   - Step B: “call” the weather API: `await delay(80)`, then return a value based on `location` (e.g. garden → 26°C sunny, home → 22°C, outside → 20°C).
3. **Output:** `Promise<WeatherContextOutput>`.

So the **chain** is: scenario → extract location → mock API(location) → weather output. The orchestrator only sees one tool call: `weatherContext(scenario)` → output. The trace shows that single call; the fact that the tool internally did “location then API” is visible in code and docs. To show **two trace entries** (chaining in the orchestrator), you’d add a separate `locationFromScenario` tool and have the orchestrator call it first, then call `weatherContext(locationFromScenario(scenario).location)` — same idea, trace shows both steps.

**Using weather in scoring:**

- If `weather.isHot` → add evidence “hot day” to **discomfort** (panting could be thermal).
- If `weather.isCold` and body.doorFocus → small boost to **toilet_needed** (“cold, wants to come back in” or “typical to want out when it’s cool”).

---

## Orchestrator change: allow async tools

Today every module is sync: `(input: string) => Output`. To support `weatherContext(scenario) => Promise<WeatherContextOutput>`:

- In the loop, always `await Promise.resolve(MODULES[name](trimmed))`. Sync tools can keep returning a plain object (wrapped in a resolved promise by `Promise.resolve`), or you can make them return `Promise.resolve(...)` for consistency.
- No change to the rest of the pipeline: you still collect one output per tool into the trace and pass the bag of signals into `scoreMotivations`.

---

## Chaining in the orchestrator (optional, for two trace entries)

If you want the **trace** to show two steps — “location” then “weather” — you run two tools and pass the first output into the second:

1. `locationResult = locationFromScenario(trimmed)` (sync).
2. Push `{ module: "locationFromScenario", input: trimmed, output: locationResult }` to trace.
3. `weatherResult = await getWeather(locationResult.location)`.
4. Push `{ module: "weather", input: locationResult.location, output: weatherResult }` to trace.

Then `weatherResult` goes into `CollectedSignals` and scoring. So: **chaining = one tool’s output is the input to the next**, and both appear in the trace. The current demo keeps the chain inside `weatherContext` (one trace entry) for minimal change; you can split it into two tools later to show the pattern in the UI.

---

## Swapping the mock for a real API

Keep the same `WeatherContextOutput` type and the same caller (orchestrator). Replace the mock body of `weatherContext` (or of `getWeather`) with e.g.:

```ts
const res = await fetch(
  `https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.1&current=temperature_2m,weather_code`
);
const data = await res.json();
return {
  tempC: data.current.temperature_2m,
  conditions: mapWeatherCode(data.current.weather_code),
  isHot: data.current.temperature_2m >= 28,
  isCold: data.current.temperature_2m <= 10,
  locationUsed: location,
};
```

No change to the orchestrator or to scoring — only the implementation of the tool changes. That’s the point of the contract.

---

## Summary

| Idea | What we do |
|------|------------|
| **Async API-like tool** | One tool returns `Promise<Output>`, orchestrator `await`s it; mock uses a short delay. |
| **Chaining** | Either (a) inside one tool: scenario → location → mock API, or (b) two tools: `locationFromScenario` → `getWeather(location)` with both in the trace. |
| **Pseudo-realistic example** | Weather/temperature: typed output, used in scoring (discomfort when hot; toilet when cold + door). |
| **Later** | Replace mock with real fetch; same `WeatherContextOutput` and same pipeline. |

This gives you a small, testable demo of “tool that looks like an API” and “chain of steps” without adding real network or keys.
