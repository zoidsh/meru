import { settingsSurface } from "../../shared/channels/surfaces.ts";
import { createClient } from "../client.ts";
import { SettingsWindow } from "../features/settings/settings-window.tsx";
import { mountPage, settingsStores } from "../page.tsx";

import "../ui/globals.css";

const client = createClient(window, settingsSurface);

mountPage(client, settingsStores(client, <SettingsWindow />));
