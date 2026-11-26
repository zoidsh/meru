import type { ElectronApplication } from "@playwright/test";

type UpdateEvent =
  | { kind: "checking" }
  | { kind: "available"; version: string }
  | { kind: "notAvailable" }
  | { kind: "downloaded"; version: string }
  | { kind: "error"; signature: boolean };

/** Sends events from the suite build's stand-in updater, as the library would. */
export const emitUpdate = (
  app: ElectronApplication,
  ...events: UpdateEvent[]
) =>
  app.evaluate((_electron, sent) => {
    const updater = Reflect.get(globalThis, "meruTestUpdater") as {
      emit: (event: unknown) => void;
    };

    for (const event of sent) {
      updater.emit(event);
    }
  }, events);

/** What the stand-in updater was asked. */
export const askedUpdater = (app: ElectronApplication) =>
  app.evaluate(() => {
    const { checks, channels, installs } = Reflect.get(
      globalThis,
      "meruTestUpdater"
    ) as { checks: number; channels: unknown[]; installs: number[] };

    return { checks, channels, installs: installs.length };
  });
