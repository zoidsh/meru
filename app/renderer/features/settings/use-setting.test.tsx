import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";

import { rendererSurface } from "../../../shared/channels/surfaces.ts";
import { FakeBridge } from "../../../test/fakes/bridge.ts";
import { createClient } from "../../client.ts";
import {
  createSettingsStore,
  SettingsContext,
  useSetting,
} from "./use-setting.ts";

const Style = () => <p>{useSetting("appearance.style")}</p>;

const Zoom = ({ profileId }: { readonly profileId: string }) => (
  <p>{useSetting("stage.zoom", profileId)}</p>
);

const roots: Root[] = [];

const mount = (seed: unknown) => {
  const bridge = new FakeBridge();
  bridge.answers.set("settings.snapshot", { ok: true, value: seed });
  const store = createSettingsStore(
    createClient({ meru: bridge }, rendererSurface)
  );
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <SettingsContext value={store}>
        <Style />
        <Zoom profileId="work" />
      </SettingsContext>
    );
  });
  const text = () =>
    [...container.querySelectorAll("p")].map((node) => node.textContent);
  const push = (changes: unknown[]) => {
    act(() => {
      bridge.emit("settings.changed", { changes });
    });
  };
  return { push, text };
};

describe(useSetting, () => {
  beforeAll(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
  });

  it("reads the seeded layers and resolves a profile's override", () => {
    const { text } = mount({
      global: { "appearance.style": "classic" },
      profiles: { work: { "stage.zoom": 1.5 } },
    });
    expect(text()).toStrictEqual(["classic", "1.5"]);
  });

  it("follows pushed changes, back to the default when a key is removed", () => {
    const { text, push } = mount({
      global: { "appearance.style": "classic" },
      profiles: {},
    });
    push([
      { key: "appearance.style", profileId: null },
      { key: "stage.zoom", profileId: "work", value: 2 },
    ]);
    expect(text()).toStrictEqual(["modern", "2"]);
  });

  it("ignores a pushed value its schema refuses", () => {
    const { text, push } = mount({ global: {}, profiles: {} });
    push([{ key: "stage.zoom", profileId: "work", value: "huge" }]);
    expect(text()).toStrictEqual(["modern", "1"]);
  });

  it("is typed from the registry", () => {
    expectTypeOf(useSetting<"appearance.style">).returns.toEqualTypeOf<
      "modern" | "classic"
    >();
    expectTypeOf(useSetting<"stage.zoom">).returns.toEqualTypeOf<number>();
    // @ts-expect-error: appearance.style is global, so it takes no profile
    expectTypeOf(useSetting<"appearance.style">).toBeCallableWith("x", "work");
  });
});
