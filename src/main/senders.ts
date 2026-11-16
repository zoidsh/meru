export type SenderIdentity =
  | { role: "shell" }
  | { role: "content-view"; profileId: string; tabId: string }
  | { role: "child-window"; profileId: string; tabId: string };

/**
 * Every webContents Meru creates, by id, with what it is. Entered when it is
 * created and dropped when it is destroyed, so a handler is told who called
 * rather than guessing from the sender.
 */
export const createSenderRegistry = () => {
  const identities = new Map<number, SenderIdentity>();

  return {
    /** Returns what drops it again. */
    register: (webContentsId: number, identity: SenderIdentity) => {
      identities.set(webContentsId, identity);

      return () => {
        identities.delete(webContentsId);
      };
    },
    identify: (webContentsId: number) => identities.get(webContentsId),
  };
};

export type SenderRegistry = ReturnType<typeof createSenderRegistry>;
