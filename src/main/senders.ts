export type SenderIdentity =
  | { role: "shell" }
  /** The shell's overlay document, which the shell draws into; never a caller. */
  | { role: "overlay" }
  | { role: "content-view"; profileId: string; tabId: string }
  | { role: "child-window"; profileId: string; tabId: string };

/**
 * Every webContents Meru creates, by id, with what it is. Entered when it is
 * created and dropped when it is destroyed, so a handler is told who called
 * rather than guessing from the sender.
 */
export const createSenderRegistry = () => {
  const identities = new Map<number, SenderIdentity>();
  const dropListeners = new Set<(webContentsId: number) => void>();

  return {
    /** Returns what drops it again. */
    register: (webContentsId: number, identity: SenderIdentity) => {
      identities.set(webContentsId, identity);

      return () => {
        identities.delete(webContentsId);

        for (const listener of dropListeners) {
          listener(webContentsId);
        }
      };
    },
    identify: (webContentsId: number) => identities.get(webContentsId),
    /** Tells the listener of each webContents dropped, by id. */
    onDropped: (listener: (webContentsId: number) => void) => {
      dropListeners.add(listener);
    },
  };
};

export type SenderRegistry = ReturnType<typeof createSenderRegistry>;
