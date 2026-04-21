import { z } from "zod";

// Shared password rules used by every place that accepts a NEW
// password: /signup, /accept-invite, /reset/[token], and the
// in-app "change password" form. Keeping the schema + check
// helpers in one module means we can't accidentally drift the
// rules between flows.
//
// Requirements (server-enforced):
//   • 10+ characters (short of a passphrase, shorter is easily
//     cracked — NIST's 8-char floor is a baseline, not a goal)
//   • at least one letter
//   • at least one digit
//   • not in the tiny hardcoded "most-common-garbage" blocklist
//
// We deliberately DO NOT require uppercase or symbol characters.
// Those requirements push users toward predictable patterns
// (Password1!) and penalize legitimate passphrase users. Instead
// the client-side `scorePassword` rewards variety so users get a
// visible nudge from "Fair" → "Strong" when they add entropy,
// without being outright blocked.

const COMMON_WEAK = new Set<string>([
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "p@ssword",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "12345678",
  "123456789",
  "1234567890",
  "abcdefgh",
  "abcd1234",
  "letmein",
  "letmein123",
  "welcome",
  "welcome123",
  "admin1234",
  "iloveyou",
  "monkey123",
  "dragon123",
  "football",
  "baseball",
]);

export interface PasswordCheck {
  minLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  notCommon: boolean;
}

export function checkPassword(password: string): PasswordCheck {
  return {
    minLength: password.length >= 10,
    hasLetter: /[a-zA-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    // Empty string short-circuits to "ok" here so we don't show
    // the "too common" warning before the user has typed anything.
    notCommon: password.length === 0 || !COMMON_WEAK.has(password.toLowerCase()),
  };
}

export function isPasswordStrong(password: string): boolean {
  const c = checkPassword(password);
  return c.minLength && c.hasLetter && c.hasNumber && c.notCommon;
}

// 0–4 strength score used to render the client-side bar. Returns
// 0 for anything that doesn't pass the required checks so the bar
// stays red until the user meets the floor.
export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export function scorePassword(password: string): PasswordScore {
  if (!isPasswordStrong(password)) return 0;

  const len = password.length;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const variety = [hasLower, hasUpper, hasSymbol].filter(Boolean).length;

  if (len >= 16 && variety >= 2) return 4;
  if (len >= 14 && variety >= 1) return 3;
  if (len >= 12) return 2;
  return 1;
}

export const PASSWORD_SCORE_LABEL: Record<PasswordScore, string> = {
  0: "Too weak",
  1: "Weak",
  2: "Fair",
  3: "Strong",
  4: "Excellent",
};

// zod schema — drop-in replacement for `z.string().min(8).max(200)`
// in every signup/reset/change form. The `.refine()` chain returns
// the first failing check's message so the server-side error
// banner matches what the client-side checklist surfaced.
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(200, "Password is too long.")
  .refine((p) => /[a-zA-Z]/.test(p), "Password must include a letter.")
  .refine((p) => /[0-9]/.test(p), "Password must include a number.")
  .refine(
    (p) => !COMMON_WEAK.has(p.toLowerCase()),
    "That password is too common — pick something less guessable.",
  );
