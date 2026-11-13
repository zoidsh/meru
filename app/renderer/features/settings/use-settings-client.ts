import type { SettingsSurface } from "../../../shared/channels/surfaces.ts";
import { defineClientContext } from "../../client-context.tsx";

const settingsClient = defineClientContext<SettingsSurface>("settings page");

/** Gives the settings window's page its client, on the settings surface. */
export const SettingsClientProvider = settingsClient.Provider;

export const useSettingsClient = settingsClient.use;
