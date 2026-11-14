import { isSignIn, resolveLinkTarget } from "../../../core/engines/links.ts";
import { besideTab, groupOf } from "../../../core/engines/ordering.ts";
import type { LogPort } from "../../../core/log.ts";
import type { ShellPort } from "../../../core/ports.ts";
import type { Disposition } from "../../../core/records/link.ts";
import { apps } from "../../../shared/apps.ts";
import type { Profiles } from "../profiles/index.ts";
import type { SettingsStore } from "../settings/index.ts";
import type { Stages } from "../stage/index.ts";

export interface LinksOptions {
  readonly log: LogPort;
  readonly profiles: Pick<Profiles, "state" | "tab" | "openTab" | "focusTab">;
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
    const { profiles, settings, stages } = this.#options;
    const load = (id: string, address: string) => {
      stages.load(id, address);
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
      this.#external(url);
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
    const group = groupOf(tabId, groups);
    const opened = profiles.openTab(
      from.profileId,
      target.appId,
      target.action === "newTab" && !background && group !== undefined
        ? besideTab(group, tabId, "vertical")
        : undefined,
      url
    );
    if (!opened.ok) {
      this.#external(url);
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

  /** Decides a blank popup at its first address: shown when it heads for Google's sign-in, which needs the opener, and otherwise sent to the browser and closed. */
  popup(url: string): boolean {
    const shows = isSignIn(url);
    if (!shows) {
      this.#external(url);
    }
    return shows;
  }

  #external(url: string): void {
    const open = async () => {
      try {
        await this.#options.shell.openExternal(url);
      } catch (error) {
        this.#options.log.warn("The browser did not open a link", {
          error,
          url,
        });
      }
    };
    void open();
  }
}
