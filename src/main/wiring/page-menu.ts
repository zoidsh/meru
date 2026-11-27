import type { ContextMenus } from "#platform/context-menu.ts";

import { createPageMenu } from "../page-menu.ts";
import type { PageMenuDeps } from "../page-menu.ts";
import type { SenderRegistry } from "../senders.ts";
import { systemPageMenus } from "./test-build.ts";

/**
 * The menu of a right click in any page Meru shows, which the sender
 * registry tells from Meru's own documents at the click.
 */
export const wirePageMenu = ({
  contextMenus,
  senders,
  ...deps
}: Omit<PageMenuDeps, "identify"> & {
  contextMenus: ContextMenus;
  senders: Pick<SenderRegistry, "identify">;
}) => {
  const pageMenu = createPageMenu({ ...deps, identify: senders.identify });

  systemPageMenus(contextMenus).watch(pageMenu.open);
};
