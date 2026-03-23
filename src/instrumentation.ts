export async function register() {
  // Suppress bigint-buffer native binding warning.
  // x402@1.1.0 depends on @solana/kit which depends on bigint-buffer.
  // The native .node addon can't load in Vercel's runtime so it falls back
  // to pure JS (which works fine) but emits this warning on every cold start.
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("bigint: Failed to load bindings")) return;
    origWarn(...args);
  };
}
