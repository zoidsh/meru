import { z } from "zod";

import { commands } from "./commands.ts";
import { defineSurface } from "./define.ts";
import type { Surface } from "./define.ts";
import { dragPushes } from "./drag.ts";
import { launcher } from "./launcher.ts";
import { profiles, profilesPushes, tabs } from "./profiles.ts";
import { settings, settingsPushes } from "./settings.ts";
import { shortcuts } from "./shortcuts.ts";
import { sidebar, sidebarPushes } from "./sidebar.ts";
import { stage, stagePushes } from "./stage.ts";
import { themePushes } from "./theme.ts";
import { updater, updaterPushes } from "./updater.ts";

export const chromeSurface = defineSurface({
  pushes: [
    stagePushes,
    settingsPushes,
    profilesPushes,
    sidebarPushes,
    themePushes,
  ],
  requests: [stage, settings, commands, profiles, tabs, sidebar, launcher],
});

export type ChromeSurface = typeof chromeSurface;

export const dragSurface = defineSurface({
  pushes: [],
  requests: [
    {
      cancelDrag: stage.cancelDrag,
      dragTo: stage.dragTo,
      endDrag: stage.endDrag,
    },
  ],
});

/** The launcher's page over the panes: it reads the profiles and the settings, opens a tab and closes itself. */
export const launcherSurface = defineSurface({
  pushes: [profilesPushes, settingsPushes, themePushes],
  requests: [
    launcher,
    { openTab: stage.openTab },
    { snapshot: profiles.snapshot },
    settings,
  ],
});

export type LauncherSurface = typeof launcherSurface;

/** The settings window's page: it reads and writes the settings and the profiles, reads the update state and checks for one, runs commands such as restarting to update, and says while it records a shortcut. */
export const settingsSurface = defineSurface({
  pushes: [settingsPushes, profilesPushes, updaterPushes, themePushes],
  requests: [settings, profiles, commands, updater, shortcuts],
});

export type SettingsSurface = typeof settingsSurface;

/** A sidebar row dragged over the panes: the page draws the row and the zone it would land in, reading where the panes are once, and reports the release. */
export const tabDragSurface = defineSurface({
  pushes: [dragPushes, themePushes],
  requests: [
    {
      cancelDrag: stage.cancelDrag,
      endDrag: stage.endDrag,
      snapshot: stage.snapshot,
    },
  ],
});

export type TabDragSurface = typeof tabDragSurface;

/** What the overlay page can show over the panes, by the `kind` its address names, each on its own surface. */
export const overlayKindSchema = z.enum(["launcher", "tabDrag"]);

export type OverlayKind = z.infer<typeof overlayKindSchema>;

export const overlays = {
  launcher: launcherSurface,
  tabDrag: tabDragSurface,
} satisfies Record<OverlayKind, Surface>;

/** The surfaces a page the renderer's preload serves may hold, by the name main passes the preload: the chrome page's, the settings page's, and each overlay's under its kind. */
export const pageSurfaceNameSchema = z.enum([
  "chrome",
  "settings",
  ...overlayKindSchema.options,
]);

export type PageSurfaceName = z.infer<typeof pageSurfaceNameSchema>;

export const pageSurfaces = {
  chrome: chromeSurface,
  settings: settingsSurface,
  ...overlays,
} satisfies Record<PageSurfaceName, Surface>;

const SURFACE_ARGUMENT = "--meru-surface=";

// A sandboxed preload sees no environment of main's, so main names the page's surface in its command line.
export const surfaceArgument = (name: PageSurfaceName): string =>
  `${SURFACE_ARGUMENT}${name}`;

const NOTHING = defineSurface({ pushes: [], requests: [] });

/** The surface the command line names, or none, so a page with no argument or an unknown name is refused everything. */
export const surfaceOf = (argv: readonly string[]): Surface => {
  const named = pageSurfaceNameSchema.safeParse(
    argv
      .find((argument) => argument.startsWith(SURFACE_ARGUMENT))
      ?.slice(SURFACE_ARGUMENT.length)
  );
  return named.success ? pageSurfaces[named.data] : NOTHING;
};

export const surfaces: readonly Surface[] = [
  chromeSurface,
  dragSurface,
  launcherSurface,
  settingsSurface,
  tabDragSurface,
];
