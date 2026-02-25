/**
 * Input guard: validate scenario before passing to the orchestrator.
 * Rejects empty, inappropriate, off-topic, and spam-like input.
 * See docs/bad-input-handling.md for the plan. Contract is swappable (e.g. moderation API later).
 */

import { INAPPROPRIATE_WORDS } from "./inputGuardBlocklist";

export type InputGuardReason = "empty" | "off_topic" | "inappropriate" | "spam";

export type InputGuardResult =
  | { allowed: true }
  | { allowed: false; reason: InputGuardReason };

const MIN_LENGTH = 12;
const DOG_KEYWORDS = [
  "dog",
  "puppy",
  "pup",
  "canine",
  "pet",
  "he's",
  "she's",
  "he is",
  "she is",
  "his",
  "her",
  "bowl",
  "walk",
  "door",
  "tail",
  "whine",
  "whining",
  "bark",
  "barking",
  "pacing",
  "staring",
  "stare",
  "couch",
  "toilet",
  "outside",
  "treat",
  "food",
  "eat",
  "eating",
  "meal",
  "leash",
  "ball",
  "play",
  "panting",
  "sniff",
  "sniffing",
  "paw",
  "pawing",
  "anxious",
  "nervous",
  "excited",
  "bored",
  "restless",
  "keys",
  "garden",
  "back door",
  "sigh",
  "circling",
];

const OFF_TOPIC_PHRASES = [
  "what is 2+2",
  "2+2",
  "write me a poem",
  "write a poem",
  "hello world",
  "hello world",
  "test test",
  "asdf",
  "qwerty",
  "the quick brown fox",
  "lorem ipsum",
  "how are you",
  "what time is it",
  "what's the weather",
  "tell me a joke",
  "sing a song",
];

const SPAM_REPEAT_CHAR_THRESHOLD = 15;
const SPAM_PREFIX_LEN = 20;
const SPAM_PREFIX_REPEATS = 3;
``
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsBlocklistedWord(normalized: string): boolean {
  const words = normalized.split(/\b\s+|\s+\b|\b/).filter(Boolean);
  for (const block of INAPPROPRIATE_WORDS) {
    if (words.includes(block)) return true;
    const re = new RegExp(`\\b${escapeRegex(block)}\\b`, "i");
    if (re.test(normalized)) return true;
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasDogKeyword(normalized: string): boolean {
  return DOG_KEYWORDS.some((kw) => normalized.includes(kw));
}

function hasOffTopicPhrase(normalized: string): boolean {
  return OFF_TOPIC_PHRASES.some((phrase) => normalized.includes(phrase));
}

function looksLikeSpam(input: string): boolean {
  const t = input.trim();
  if (t.length < SPAM_PREFIX_LEN * 2) return false;
  const firstChar = t[0];
  if (firstChar) {
    const sameCharCount = t.split("").filter((c) => c === firstChar).length;
    if (sameCharCount >= SPAM_REPEAT_CHAR_THRESHOLD) return true;
  }
  const prefix = t.slice(0, SPAM_PREFIX_LEN);
  let count = 0;
  let idx = 0;
  while (idx < t.length) {
    if (t.slice(idx, idx + SPAM_PREFIX_LEN) === prefix) {
      count++;
      idx += SPAM_PREFIX_LEN;
    } else {
      idx++;
    }
  }
  return count >= SPAM_PREFIX_REPEATS;
}

/**
 * Validate scenario input before passing to runDogInterpreter.
 * Returns { allowed: true } or { allowed: false, reason }.
 * Do not log or store the raw input when rejected.
 */
export function validateScenario(input: string): InputGuardResult {
  const trimmed = input.trim();
  const normalized = normalizeForMatch(trimmed);

  if (trimmed.length === 0) {
    return { allowed: false, reason: "empty" };
  }

  // Check off-topic phrases before blocklist so e.g. "Hello world" is off_topic not inappropriate ("hell" in blocklist can match inside "hello")
  if (hasOffTopicPhrase(normalized)) {
    return { allowed: false, reason: "off_topic" };
  }

  if (containsBlocklistedWord(normalized)) {
    return { allowed: false, reason: "inappropriate" };
  }

  if (looksLikeSpam(trimmed)) {
    return { allowed: false, reason: "spam" };
  }

  if (trimmed.length < MIN_LENGTH || !hasDogKeyword(normalized)) {
    return { allowed: false, reason: "off_topic" };
  }

  return { allowed: true };
}
