import { commands } from "./commands.ts";
import { defineSurface } from "./define.ts";
import type { Surface } from "./define.ts";
import { drag } from "./drag.ts";
import { e2e } from "./e2e.ts";
import { settings, settingsPushes } from "./settings.ts";
import { stage, stagePushes } from "./stage.ts";

export const rendererSurface = defineSurface({
  pushes: [stagePushes, settingsPushes],
  requests: [stage, settings, commands, e2e],
});

export type RendererSurface = typeof rendererSurface;

export const dragSurface = defineSurface({ pushes: [], requests: [drag] });

export const surfaces: readonly Surface[] = [rendererSurface, dragSurface];
