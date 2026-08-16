/** Where the package reports what it did, since an embedder logs its own way. */
export type ExtensionsLogger = {
  info: (message: string, details: Record<string, unknown>) => void;
  error: (message: string, details: Record<string, unknown>) => void;
};
