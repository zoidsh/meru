/**
 * The fuses the end-to-end build sets apart from `build.electronFuses`, which
 * `tests/hardening.e2e.ts` reads to know what else the build must match.
 *
 * `_electron.launch` waits for the main process to print "Debugger listening
 * on", which it gets by passing `--inspect=0`, so the shipped build's
 * `enableNodeCliInspectArguments: false` would hang every test.
 */
export const E2E_FUSE_OVERRIDES = { enableNodeCliInspectArguments: true } as const;
