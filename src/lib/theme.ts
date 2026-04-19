// Theme preference type. Lives outside the "use server" actions file
// because Next.js requires every export of a "use server" module to be
// an async function — re-exporting a plain type breaks the server-action
// bundler with a webpack "Cannot read properties of undefined (reading
// 'call')" at runtime on the client chunk.

export type ThemePref = "system" | "light" | "dark";
