import { describe, expect, it } from "vitest";

import type { Theme } from "../../../core/records/theme.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { FakeTheme } from "../../../test/fakes/theme.ts";
import { testApp } from "../../testing.ts";
import { Appearance } from "./index.ts";

const PAGE = 7;

const setup = async () => {
  const { registrar, transport } = await testApp();
  registrar.assign(PAGE, chromeSurface);
  const theme = new FakeTheme();
  const painted: [string, Theme][] = [];
  const windowNamed = (name: string) => ({
    recolour: (given: Theme) => {
      painted.push([name, given]);
    },
  });
  const appearance = new Appearance({
    registrar,
    theme,
    windows: [windowNamed("main"), windowNamed("settings")],
  });
  appearance.start();
  return { appearance, painted, theme, transport };
};

describe(Appearance, () => {
  it("repaints every window in the system's new theme and tells every page", async () => {
    const { painted, theme, transport } = await setup();
    theme.set(true);
    expect({
      painted,
      sent: transport.sent.map(({ channel, contentsId, payload }) => [
        channel,
        contentsId,
        payload,
      ]),
    }).toStrictEqual({
      painted: [
        ["main", "dark"],
        ["settings", "dark"],
      ],
      sent: [["theme.changed", PAGE, { theme: "dark" }]],
    });
  });

  it("stops following the theme once disposed", async () => {
    const { appearance, painted, theme, transport } = await setup();
    appearance.dispose();
    theme.set(true);
    expect([painted, transport.sent]).toStrictEqual([[], []]);
  });
});
