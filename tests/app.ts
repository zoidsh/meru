import type { ElectronApplication, Page } from "@playwright/test";

import type { Result } from "../app/core/result.ts";
import type { IpcError } from "../app/shared/channels/define.ts";
import { e2e } from "../app/shared/channels/e2e.ts";
import { entitlement } from "../app/shared/channels/entitlement.ts";
import { profiles } from "../app/shared/channels/profiles.ts";
import { stage } from "../app/shared/channels/stage.ts";
import { updater } from "../app/shared/channels/updater.ts";
import type { CommandId } from "../app/shared/commands/registry.ts";
import { invokeIn } from "../scripts/lib/app.ts";

const valueOf = <T>(result: Result<T, IpcError>): T => {
  if (!result.ok) {
    throw new Error(`${result.error.kind}: ${result.error.message}`);
  }
  return result.value;
};

/** What Electron holds for the page's stage and the menu: the bounds of each child view, bottom first, each pane's zoom and each command's accelerator. */
export const inspect = async (chrome: Page) =>
  valueOf(await invokeIn(chrome, e2e.snapshot, {}));

export const viewsOf = async (chrome: Page) => {
  const { views } = await inspect(chrome);
  return views;
};

export const zoomOf = async (chrome: Page) => {
  const { zoom } = await inspect(chrome);
  return zoom;
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
