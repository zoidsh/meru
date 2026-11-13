import { paneOfTab } from "../../../core/engines/layout.ts";
import { isSignIn, resolveLinkTarget } from "../../../core/engines/links.ts";
import { groupOf } from "../../../core/engines/ordering.ts";
import type { ShellPort } from "../../../core/ports.ts";
import type { Placement } from "../../../core/records/layout.ts";
import type { Disposition } from "../../../core/records/link.ts";
import { apps } from "../../../shared/apps.ts";
import type { Profiles } from "../profiles/index.ts";
import type { SettingsStore } from "../settings/index.ts";
import type { Stages } from "../stage/index.ts";

export interface LinksOptions {
  readonly profiles: Pick<
    Profiles,
    "state" | "tab" | "openTab" | "focusTab" | "navigateTab"
  >;
  readonly settings: Pick<SettingsStore, "get">;
  readonly shell: ShellPort;
  /** Loads the address in the tab's view, wherever a stage keeps one. */
  readonly stages: Pick<Stages, "load">;
}

/** Carries out where resolveLinkTarget sends a link a pane's page opens. */
export class Links {
  readonly #options: LinksOptions;

  constructor(options: LinksOptions) {
    this.#options = options;
  }

  /** Routes a link the tab's page opened; true when it was taken from the page. A page navigating itself is left to it, so Google's sign-in and its redirects stay in the pane, and so is a window onto accounts.google.com, which signs in. */
  open(tabId: string, url: string, disposition: Disposition): boolean {
    const { profiles, shell, settings, stages } = this.#options;
    // A tab no stage keeps a view of yet would lose the link, so it takes the address and its view starts there once shown.
    const load = (id: string, address: string) => {
      if (!stages.load(id, address)) {
        profiles.navigateTab(id, address);
      }
    };
    const from = profiles.tab(tabId);
    if (from === undefined || disposition === "inPlace" || isSignIn(url)) {
      return false;
    }
    const { groups, tabs } = profiles.state;
    const target = resolveLinkTarget(url, {
      catalog: apps,
      disposition,
      from,
      groups,
      settings: {
        excludedApps: settings.get("links.excludedApps"),
        openInApp: settings.get("links.openInApp"),
      },
      tabs,
    });
    if (target.action === "samePane") {
      load(tabId, url);
      return true;
    }
    if (target.action === "external") {
      shell.openExternal(url);
      return true;
    }
    const background = target.action === "newTab" && target.background;
    const existing = target.action === "newTab" ? target.tabId : undefined;
    if (existing !== undefined) {
      load(existing, url);
      if (!background) {
        profiles.focusTab(existing);
      }
      return true;
    }
    const opened = profiles.openTab(
      from.profileId,
      target.appId,
      target.action === "newTab" && !background
        ? this.#beside(tabId)
        : undefined,
      url
    );
    if (!opened.ok) {
      shell.openExternal(url);
      return true;
    }
    if (opened.value.url !== url) {
      load(opened.value.id, url);
    }
    if (!background) {
      profiles.focusTab(opened.value.id);
    }
    return true;
  }

  /** Beside the tab's pane, in its group. */
  #beside(tabId: string): Placement | undefined {
    const group = groupOf(tabId, this.#options.profiles.state.groups);
    const paneId =
      group === undefined ? undefined : paneOfTab(group.layout, tabId);
    return group === undefined || paneId === undefined
      ? undefined
      : { groupId: group.id, orientation: "vertical", paneId, side: "after" };
  }
}
