const RESERVED = new Set([
  "api", "admin", "platform", "login", "logout", "signup", "auth",
  "settings", "billing", "support", "help", "docs", "www", "app",
  "select-tenant", "accept-invite", "account-suspended", "t",
]);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug);
}
