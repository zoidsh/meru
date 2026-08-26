/**
 * The fixture extension's identity, importable without touching Electron so
 * the end-to-end tests can address the extension before it is loaded.
 *
 * The id is fixed because the manifest carries a `key`: without one Chromium
 * generates a different id per derived copy, and the shared instance's worker
 * and shim would never find each other. The value is pinned here by hand and
 * proven against the manifest in `fixture.test.ts`, so a key change that
 * forgot this constant fails a unit test rather than an end-to-end run.
 */
export const FIXTURE_EXTENSION_ID = "fjcmflaeedcpibfikabpoadlcjblpgje";
