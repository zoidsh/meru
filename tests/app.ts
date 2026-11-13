import type { ElectronApplication, Page } from "@playwright/test";

import type { Result } from "../app/core/result.ts";
import { E2E_GLOBAL, e2eSnapshotSchema } from "../app/main/shell/e2e.ts";
import type { IpcError } from "../app/shared/channels/define.ts";
import { entitlement } from "../app/shared/channels/entitlement.ts";
import { profiles } from "../app/shared/channels/profiles.ts";
import { stage } from "../app/shared/channels/stage.ts";
import { updater } from "../app/shared/channels/updater.ts";
import type { CommandId } from "../app/shared/commands/registry.ts";
import { invokeIn, readExposed } from "../scripts/lib/app.ts";

const valueOf = <T>(result: Result<T, IpcError>): T => {
  if (!result.ok) {
    throw new Error(`${result.error.kind}: ${result.error.message}`);
  }
  return result.value;
};

/** What Electron holds for the page's stage and the menu: the bounds of each child view, bottom first, each pane's tab, web contents and zoom, and each command's accelerator. */
export const inspect = async (app: ElectronApplication) =>
  e2eSnapshotSchema.parse(await readExposed(app, E2E_GLOBAL));

export const viewsOf = async (app: ElectronApplication) => {
  const { views } = await inspect(app);
  return views;
};

/** Each pane's tab with the id of the web contents showing it and its zoom, in layout order. */
export const panesOf = async (app: ElectronApplication) => {
  const { panes } = await inspect(app);
  return panes;
};

export const zoomOf = async (app: ElectronApplication) => {
  const panes = await panesOf(app);
  return panes.map((pane) => pane.zoom);
};

export const stageOf = async (chrome: Page) =>
  valueOf(await invokeIn(chrome, stage.snapshot, {}));

export const profilesOf = async (chrome: Page) =>
  valueOf(await invokeIn(chrome, profiles.snapshot, {}));

export const entitlementOf = async (chrome: Page) =>
  valueOf(await invokeIn(chrome, entitlement.snapshot, {}));

export const updateOf = async (chrome: Page) =>
  valueOf(await invokeIn(chrome, updater.snapshot, {}));

export const styleOf = async (chrome: Page) => {
  const { style } = await stageOf(chrome);
  return style;
};

export const clickMenuItem = async (
  app: ElectronApplication,
  id: CommandId
) => {
  await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
    if (!item) {
      throw new Error(`No menu item ${itemId}`);
    }
    // MenuItem.click is typed as a bare Function.
    Reflect.apply(item.click, item, []);
  }, id);
};
