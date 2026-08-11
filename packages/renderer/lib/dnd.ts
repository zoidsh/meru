import { Accessibility, defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import { PointerSensor } from "@dnd-kit/react";

export const sortablePlugins = defaultPreset.plugins.filter((plugin) => plugin !== Accessibility);

/**
 * A row is dragged by its whole surface, so the buttons sitting on it — closing
 * a tab, removing a bookmark — mark themselves `data-sortable-action` to be
 * clicked rather than dragged from.
 */
export const sortableSensors = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
    preventActivation: (event) =>
      event.target instanceof Element && event.target.closest("[data-sortable-action]") !== null,
  }),
];
