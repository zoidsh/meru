import path from "node:path";
import type { Indexer, IndexInput } from "storybook/internal/types";
import type { Plugin } from "vite";
import { playgroundComponents, type PlaygroundComponentId } from "../components";
import { scenarios } from "../scenarios";

/**
 * Storybook indexes files it finds on disk, so a story per scenario would mean
 * a file per scenario: ES modules have no computed export names, and the
 * scenario list is the one place a scenario is allowed to live. The catalog
 * therefore becomes virtual modules instead — one per call site, generated from
 * the same two lists the indexer below reads — and `scenarios.ts` is the only
 * file the `stories` glob points at.
 */
const VIRTUAL_PREFIX = "virtual:meru-playground/";

/** Where the story factory lives, imported by every generated module. */
const STORY_FACTORY_PATH = path.join(import.meta.dirname, "story.tsx");

function componentIds(): PlaygroundComponentId[] {
  return Object.keys(playgroundComponents) as PlaygroundComponentId[];
}

function virtualModuleId(componentId: PlaygroundComponentId): string {
  return `${VIRTUAL_PREFIX}${componentId}.tsx`;
}

/**
 * The story id is pinned rather than derived from the title and the export
 * name, so that the fake bridge can read a scenario id straight out of the
 * preview's URL before any renderer module has evaluated.
 */
function storyId(componentId: PlaygroundComponentId, scenarioId: string): string {
  return `${componentId.toLowerCase()}--${scenarioId}`;
}

/** Turns a scenario id into the identifier the generated module exports it as. */
function exportName(scenarioId: string): string {
  return scenarioId.replace(/-(.)/g, (_match, character: string) => character.toUpperCase());
}

export const playgroundStoryIndexer: Indexer = {
  test: /playground[\\/]scenarios\.ts$/,
  createIndex: async () =>
    componentIds().flatMap((componentId): IndexInput[] =>
      scenarios
        .filter((scenario) => scenario.component === componentId)
        .map((scenario) => ({
          type: "story",
          importPath: virtualModuleId(componentId),
          exportName: exportName(scenario.id),
          title: playgroundComponents[componentId].name,
          name: scenario.name,
          __id: storyId(componentId, scenario.id),
        })),
    ),
};

function generateModule(
  componentId: PlaygroundComponentId,
  storyFactoryImportPath: string,
): string {
  const componentScenarios = scenarios.filter((scenario) => scenario.component === componentId);

  return [
    `import { createScenarioStory } from ${JSON.stringify(storyFactoryImportPath)};`,
    "",
    `export default { title: ${JSON.stringify(playgroundComponents[componentId].name)} };`,
    "",
    ...componentScenarios.map(
      (scenario) =>
        `export const ${exportName(scenario.id)} = createScenarioStory(${JSON.stringify(scenario.id)}, ${JSON.stringify(storyId(componentId, scenario.id))});`,
    ),
  ].join("\n");
}

/** Serves the modules the indexer above pointed every entry at. */
export function playgroundStoriesPlugin(): Plugin {
  let storyFactoryImportPath = "";

  return {
    name: "meru-playground-stories",
    configResolved(config) {
      storyFactoryImportPath = `/${path.relative(config.root, STORY_FACTORY_PATH)}`;
    },
    resolveId(id) {
      return id.startsWith(VIRTUAL_PREFIX) ? `\0${id}` : null;
    },
    load(id) {
      if (!id.startsWith(`\0${VIRTUAL_PREFIX}`)) {
        return null;
      }

      const componentId = id.slice(`\0${VIRTUAL_PREFIX}`.length, -".tsx".length);

      return generateModule(componentId as PlaygroundComponentId, storyFactoryImportPath);
    },
  };
}
