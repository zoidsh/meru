import path from "node:path";

/**
 * Resolved from the environment rather than left to `PATH`, which a user can
 * put another `reg` on the front of.
 */
export function getRegExePath() {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? String.raw`C:\Windows`;

  return path.join(systemRoot, "System32", "reg.exe");
}
