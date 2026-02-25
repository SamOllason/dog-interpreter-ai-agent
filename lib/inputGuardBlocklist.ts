/**
 * Blocklist for input guard: inappropriate words/phrases.
 * Normalized (lowercase); input is checked against these after normalization.
 * Edit this file to add or remove entries — no need to touch inputGuard logic.
 */

export const INAPPROPRIATE_WORDS: readonly string[] = [
  // Profanity (obvious only; expand as needed)
  "damn",
  "hell",
  "crap",
  "stupid",
  "idiot",
  "dumb",
  "cat", 
];
