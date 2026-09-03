/**
 * Where the package reports what it did, since an embedder logs its own way.
 *
 * `debug` carries what a third party wrote, meaning an extension's own console
 * output, so an embedder can keep it out of a shipped log while `info` and
 * `error` stay the package's own account of what it did.
 */
export type ExtensionsLogger = {
  debug: (message: string, details: Record<string, unknown>) => void;
  info: (message: string, details: Record<string, unknown>) => void;
  error: (message: string, details: Record<string, unknown>) => void;
};
