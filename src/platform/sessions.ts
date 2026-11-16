import { session } from "electron";

/** A permission a frame asks for or checks, as `allows` is given it. */
export interface PermissionAsk {
  permission: string;
  requestingUrl: string;
  mediaTypes?: readonly string[];
}

export interface Sessions {
  /** Every kind of data the partition's session holds, cache included. */
  clear: (partition: string) => Promise<void>;
  /**
   * Answers every permission request and check in the partition's session with
   * `allows`, in place of Electron's default of granting all, and refuses
   * screen capture. Once per session; later calls change nothing.
   */
  guard: (partition: string, allows: (ask: PermissionAsk) => boolean) => void;
}

export const createSessions = (): Sessions => {
  const guarded = new WeakSet<Electron.Session>();

  return {
    clear: (partition) => session.fromPartition(partition).clearData(),
    guard: (partition, allows) => {
      const guarding = session.fromPartition(partition);

      if (guarded.has(guarding)) {
        return;
      }

      guarded.add(guarding);
      guarding.setPermissionRequestHandler(
        (_webContents, permission, answer, details) => {
          answer(
            allows({
              permission,
              requestingUrl: details.requestingUrl,
              ...("mediaTypes" in details && details.mediaTypes
                ? { mediaTypes: details.mediaTypes }
                : {}),
            })
          );
        }
      );
      guarding.setPermissionCheckHandler(
        (_webContents, permission, requestingOrigin, details) =>
          allows({
            permission,
            requestingUrl: requestingOrigin,
            ...(details.mediaType ? { mediaTypes: [details.mediaType] } : {}),
          })
      );
      // Sharing a screen needs a picker Meru does not have yet.
      guarding.setDisplayMediaRequestHandler((_request, answer) => {
        answer(null);
      });
    },
  };
};
