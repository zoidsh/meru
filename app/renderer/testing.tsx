import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { onTestFinished } from "vitest";
import type { z } from "zod";

import type { Group } from "../core/records/group.ts";
import type { LayoutNode } from "../core/records/layout.ts";
import type { Platform } from "../core/records/platform.ts";
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
  chromeSurface,
  launcherSurface,
  settingsSurface,
} from "../shared/channels/surfaces.ts";
import { FakeBridge } from "../test/fakes/bridge.ts";
import { createClient } from "./client.ts";
import { LauncherClientProvider } from "./features/launcher/use-launcher-client.ts";
import type { ShownProfile } from "./features/profiles/use-profiles.ts";
import { chromeStores, settingsStores } from "./page.tsx";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

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

type ShownTab = ProfilesSnapshot["tabs"][number];

export const tabOf = (
  id: string,
  appId: string,
  profileId = "personal",
  closeable = true
): ShownTab => ({
  appId,
  asleep: false,
  closeable,
  health: "ok",
  id,
  profileId,
  sleeps: false,
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

const mount = (
  render: (bridge: FakeBridge) => ReactNode,
  answers: Answers,
  platform: Platform
) => {
  const bridge = new FakeBridge(platform);
  for (const { channel, value } of answers) {
    bridge.answers.set(wireName(channel), { ok: true, value });
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(render(bridge));
  });
  let mounted = true;
  const unmount = () => {
    if (!mounted) {
      return;
    }
    mounted = false;
    act(() => {
      root.unmount();
    });
    container.remove();
  };
  onTestFinished(unmount);
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
    unmount,
  };
};

// React tracks an input's value through its own setter, so the value is set past it for the change to reach onChange.
/** Types `text` into `field` as a user would, replacing what it held. */
export const typeInto = (
  field: HTMLInputElement | null | undefined,
  text: string
) => {
  act(() => {
    if (field === null || field === undefined) {
      return;
    }
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

/** Lets the promises a render or a request started settle, such as a client's answers. */
export const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

/** Renders under the providers of the chrome page and the launcher's, whose clients talk to a fake bridge seeded with `answers`; it unmounts when the test finishes. */
export const mountChrome = (
  node: ReactNode,
  answers: Answers,
  platform: Platform = "darwin"
) =>
  mount(
    (bridge) => {
      const client = createClient({ meru: bridge }, chromeSurface);
      const launcherClient = createClient({ meru: bridge }, launcherSurface);
      return chromeStores(
        client,
        <LauncherClientProvider client={launcherClient}>
          {node}
        </LauncherClientProvider>
      );
    },
    answers,
    platform
  );

/** Renders under the settings window's providers, whose client talks to a fake bridge seeded with `answers`; it unmounts when the test finishes. */
export const mountSettings = (
  node: ReactNode,
  answers: Answers,
  platform: Platform = "darwin"
) =>
  mount(
    (bridge) => {
      const client = createClient({ meru: bridge }, settingsSurface);
      return settingsStores(client, node);
    },
    answers,
    platform
  );
