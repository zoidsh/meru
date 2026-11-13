import { commands } from "./commands.ts";
import { defineSurface } from "./define.ts";
import type { Surface } from "./define.ts";
import { drag } from "./drag.ts";
import { e2e } from "./e2e.ts";
import { entitlement, entitlementPushes } from "./entitlement.ts";
import { measure } from "./measure.ts";
import { settings, settingsPushes } from "./settings.ts";
import { stage, stagePushes } from "./stage.ts";
import { updater, updaterPushes } from "./updater.ts";

export const rendererSurface = defineSurface({
  pushes: [stagePushes, settingsPushes, entitlementPushes, updaterPushes],
  requests: [stage, settings, commands, entitlement, updater, e2e, measure],
});

export type RendererSurface = typeof rendererSurface;

export const dragSurface = defineSurface({ pushes: [], requests: [drag] });

export const surfaces: readonly Surface[] = [rendererSurface, dragSurface];
