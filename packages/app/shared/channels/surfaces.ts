import { defineSurface } from "./define.ts";
import type { Surface } from "./define.ts";
import { drag } from "./drag.ts";
import { settings, settingsPushes } from "./settings.ts";
import { e2e, stage, stagePushes } from "./stage.ts";

export const rendererSurface = defineSurface({
  pushes: [stagePushes, settingsPushes],
  requests: [stage, settings, e2e],
});

export type RendererSurface = typeof rendererSurface;

export const dragSurface = defineSurface({ pushes: [], requests: [drag] });

export const surfaces: readonly Surface[] = [rendererSurface, dragSurface];
