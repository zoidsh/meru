import { commands } from "./commands.ts";
import { defineSurface } from "./define.ts";
import type { Surface } from "./define.ts";
import { drag } from "./drag.ts";
import { e2e } from "./e2e.ts";
import { entitlement, entitlementPushes } from "./entitlement.ts";
import { launcher, launcherPushes } from "./launcher.ts";
import { measure } from "./measure.ts";
import { profiles, profilesPushes, tabs } from "./profiles.ts";
import { settings, settingsPushes } from "./settings.ts";
import { sidebar, sidebarPushes } from "./sidebar.ts";
import { stage, stagePushes } from "./stage.ts";
import { updater, updaterPushes } from "./updater.ts";

export const chromeSurface = defineSurface({
  pushes: [
    stagePushes,
    settingsPushes,
    entitlementPushes,
    updaterPushes,
    profilesPushes,
    sidebarPushes,
    launcherPushes,
  ],
  requests: [
    stage,
    settings,
    commands,
    entitlement,
    updater,
    profiles,
    tabs,
    sidebar,
    launcher,
  ],
});

export type ChromeSurface = typeof chromeSurface;

/** The chrome page's surface in a run the end-to-end suite or `pnpm measure` drives, which also inspects what main holds. */
export const testSurface = defineSurface({
  pushes: chromeSurface.pushes,
  requests: [...chromeSurface.requests, e2e, measure],
});

export const dragSurface = defineSurface({ pushes: [], requests: [drag] });

/** The launcher's page over the panes: it reads the profiles and the settings, opens a tab and closes itself. */
export const launcherSurface = defineSurface({
  pushes: [profilesPushes, settingsPushes],
  requests: [
    launcher,
    { openTab: stage.openTab },
    { snapshot: profiles.snapshot },
    settings,
  ],
});

export type LauncherSurface = typeof launcherSurface;

/** The surfaces a page the renderer's preload serves may hold, by the name main passes the preload. */
export const pageSurfaces = {
  chrome: chromeSurface,
  launcher: launcherSurface,
  test: testSurface,
};

export type PageSurfaceName = keyof typeof pageSurfaces;

const SURFACE_ARGUMENT = "--meru-surface=";

// A sandboxed preload sees no environment of main's, so main names the page's surface in its command line.
export const surfaceArgument = (name: PageSurfaceName): string =>
  `${SURFACE_ARGUMENT}${name}`;

/** The surface the command line names, or none, so a page with no argument is refused everything. */
export const surfaceOf = (argv: readonly string[]): Surface => {
  const name = argv
    .find((argument) => argument.startsWith(SURFACE_ARGUMENT))
    ?.slice(SURFACE_ARGUMENT.length);
  const named = new Map<string, Surface>(Object.entries(pageSurfaces));
  return (
    (name === undefined ? undefined : named.get(name)) ??
    defineSurface({ pushes: [], requests: [] })
  );
};

export const surfaces: readonly Surface[] = [
  chromeSurface,
  dragSurface,
  launcherSurface,
];
