import { defineSurface } from "./define.ts";
import type { Surface } from "./define.ts";
import { e2e, stage, stagePushes } from "./stage.ts";

export const rendererSurface = defineSurface({
  pushes: [stagePushes],
  requests: [stage, e2e],
});

export type RendererSurface = typeof rendererSurface;

export const surfaces: readonly Surface[] = [rendererSurface];
