// Tiny className joiner. Accepts strings, falsy values, and arrays of the
// same. Kept dependency-free on purpose — this runs on every render and
// doesn't need the full clsx/cva surface area.

type ClassValue = string | number | null | undefined | false | ClassValue[];

export function cn(...parts: ClassValue[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (typeof p === "string" || typeof p === "number") {
      out.push(String(p));
    } else if (Array.isArray(p)) {
      const joined = cn(...p);
      if (joined) out.push(joined);
    }
  }
  return out.join(" ");
}
