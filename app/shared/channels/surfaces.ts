import { commands } from "./commands.ts";
import { defineSurface } from "./define.ts";
import type { Surface } from "./define.ts";
import { drag } from "./drag.ts";
import { e2e } from "./e2e.ts";
import { entitlement, entitlementPushes } from "./entitlement.ts";
import { measure } from "./measure.ts";
import { profiles, profilesPushes, tabs } from "./profiles.ts";
import { settings, settingsPushes } from "./settings.ts";
import { sidebar, sidebarPushes } from "./sidebar.ts";
import { stage, stagePushes } from "./stage.ts";
import { updater, updaterPushes } from "./updater.ts";

export const rendererSurface = defineSurface({
  pushes: [
    stagePushes,
    settingsPushes,
    entitlementPushes,
    updaterPushes,
    profilesPushes,
    sidebarPushes,
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
  ],
});

export type RendererSurface = typeof rendererSurface;

/** The chrome page's surface in a run the end-to-end suite or `pnpm measure` drives, which also inspects what main holds. */
export const testSurface = defineSurface({
  pushes: rendererSurface.pushes,
  requests: [...rendererSurface.requests, e2e, measure],
});

/** The argument main passes the chrome page's preload in such a run, since a sandboxed preload sees no environment of main's. */
export const TEST_SURFACE_ARGUMENT = "--meru-test-surface";

export const dragSurface = defineSurface({ pushes: [], requests: [drag] });

export const surfaces: readonly Surface[] = [rendererSurface, dragSurface];
