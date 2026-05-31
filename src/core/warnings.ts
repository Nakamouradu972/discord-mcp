/**
 * Suppress Node's `ExperimentalWarning` for the built-in `node:sqlite` module.
 *
 * `node:sqlite` is stable enough for our append-only event queue, but Node
 * prints a noisy ExperimentalWarning on import. We filter only that specific
 * warning so every other process warning still surfaces. Call once at startup.
 */
export function silenceSqliteExperimentalWarning(): void {
  const original = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const message = typeof warning === "string" ? warning : warning.message;
    const type = typeof args[0] === "string" ? args[0] : (args[0] as { type?: string })?.type;
    if (type === "ExperimentalWarning" && /SQLite/i.test(message)) return;
    return (original as (...a: unknown[]) => void)(warning, ...args);
  }) as typeof process.emitWarning;
}

// Apply on import so it is active before `node:sqlite` is first loaded.
silenceSqliteExperimentalWarning();
