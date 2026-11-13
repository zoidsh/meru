import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { z } from "zod";

import type { Group } from "../core/records/group.ts";
import type { LayoutNode } from "../core/records/layout.ts";
import type { Tab } from "../core/records/tab.ts";
import { wireName } from "../shared/channels/define.ts";
import type {
  InvokeChannel,
  PushChannel,
  RequestChannel,
  SyncChannel,
} from "../shared/channels/define.ts";
import type { ProfilesSnapshot } from "../shared/channels/profiles.ts";
import type { StageSnapshot } from "../shared/channels/stage.ts";
import {
  launcherSurface,
  rendererSurface,
} from "../shared/channels/surfaces.ts";
import { FakeBridge } from "../test/fakes/bridge.ts";
import { ChromeProvider } from "./chrome-context.tsx";
import { createClient } from "./client.ts";
import { LauncherClientProvider } from "./features/launcher/use-launcher-client.ts";
import {
  createProfilesStore,
  ProfilesContext,
} from "./features/profiles/use-profiles.ts";
import {
  createSettingsStore,
  SettingsContext,
} from "./features/settings/use-setting.ts";
import {
  createSidebarStore,
  SidebarContext,
} from "./features/sidebar/use-sidebar.ts";
import { createStageStore, StageContext } from "./features/stage/use-stage.ts";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type ShownProfile = ProfilesSnapshot["profiles"][number];

export const profileOf = (
  id: string,
  more: Partial<ShownProfile> = {}
): ShownProfile => ({
  color: "#0090ff",
  deactivated: false,
  id,
  label: id,
  order: 0,
  status: { kind: "ok" },
  ...more,
});

export const tabOf = (
  id: string,
  appId: string,
  profileId = "personal"
): Tab => ({
  appId,
  health: "ok",
  id,
  pinned: false,
  profileId,
  sleeping: false,
  title: `${appId} ${id}`,
  url: "https://example.com/",
  zoom: 1,
});

/** A group of the tabs, side by side in that order. */
export const groupOf = (
  id: string,
  tabIds: readonly string[],
  profileId = "personal"
): Group => {
  let layout: LayoutNode | null = null;
  for (const [index, tabId] of tabIds.entries()) {
    const leaf: LayoutNode = {
      kind: "leaf",
      paneId: `pane-${tabId}`,
      tabIds: [tabId],
    };
    layout =
      layout === null
        ? leaf
        : {
            first: layout,
            id: `${id}-split-${index}`,
            kind: "split",
            orientation: "vertical",
            ratio: 0.5,
            second: leaf,
          };
  }
  return { id, layout, profileId, tabIds: [...tabIds] };
};

export const stageOf = (more: Partial<StageSnapshot> = {}): StageSnapshot => ({
  dividers: [],
  focusedPaneId: null,
  navigation: null,
  panes: [],
  style: "modern",
  ...more,
});

/** What main answers a request with. */
export interface Answer {
  readonly channel: InvokeChannel | SyncChannel;
  readonly value: unknown;
}

export const answer = <C extends InvokeChannel | SyncChannel>(
  channel: C,
  value: z.input<C["result"]>
): Answer => ({ channel, value });

/** What main answers the page's requests with; a later answer for a channel replaces an earlier one. */
export type Answers = readonly Answer[];

/** Renders under the providers of the chrome page and the launcher's, whose clients talk to a fake bridge seeded with `answers`. */
export const mountChrome = (
  node: ReactNode,
  answers: Answers,
  platform = "darwin"
) => {
  const bridge = new FakeBridge(platform);
  for (const { channel, value } of answers) {
    bridge.answers.set(wireName(channel), { ok: true, value });
  }
  const client = createClient({ meru: bridge }, rendererSurface);
  const launcherClient = createClient({ meru: bridge }, launcherSurface);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ChromeProvider client={client}>
        <LauncherClientProvider client={launcherClient}>
          <SettingsContext value={createSettingsStore(client)}>
            <ProfilesContext value={createProfilesStore(client)}>
              <StageContext value={createStageStore(client)}>
                <SidebarContext value={createSidebarStore(client)}>
                  {node}
                </SidebarContext>
              </StageContext>
            </ProfilesContext>
          </SettingsContext>
        </LauncherClientProvider>
      </ChromeProvider>
    );
  });
  return {
    bridge,
    container,
    push: <C extends PushChannel>(
      channel: C,
      payload: z.input<C["payload"]>
    ) => {
      act(() => {
        bridge.emit(wireName(channel), payload);
      });
    },
    sentOn: (channel: RequestChannel) =>
      bridge.sent
        .filter((sent) => sent.channel === wireName(channel))
        .map((sent) => sent.payload),
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
};
