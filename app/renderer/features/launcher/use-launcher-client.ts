import type { LauncherSurface } from "../../../shared/channels/surfaces.ts";
import { defineClientContext } from "../../chrome-context.tsx";

const launcherClient = defineClientContext<LauncherSurface>("launcher");

/** Gives the launcher's page its client, on the launcher's surface. */
export const LauncherClientProvider = launcherClient.Provider;

export const useLauncherClient = launcherClient.use;
