/**
 * The one license request the interface may have out: an activation, a
 * rename or a retry. It lives in main rather than in a page, so a window
 * closed and opened again while one is out still waits for it, and every
 * surface that sends one shares it.
 */
export const createLicenseRequests = () => {
  let out = false;
  const listeners = new Set<() => void>();

  const set = (next: boolean) => {
    out = next;

    for (const listener of listeners) {
      listener();
    }
  };

  return {
    busy: () => out,
    /** Runs `request` unless one is out, which it rejects. */
    run: async <Result>(request: () => Promise<Result>) => {
      if (out) {
        throw new Error("A license request is already out");
      }

      set(true);

      try {
        return await request();
      } finally {
        set(false);
      }
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type LicenseRequests = ReturnType<typeof createLicenseRequests>;
