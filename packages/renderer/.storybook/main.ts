import path from "node:path";
import type { StorybookConfig } from "@storybook/react-vite";
import viteTailwindcss from "@tailwindcss/vite";
import { playgroundStoriesPlugin, playgroundStoryIndexer } from "../playground/storybook/stories";

export default {
  framework: "@storybook/react-vite",
  /**
   * The scenario list is the only file the glob points at, because the stories
   * are generated from it rather than written beside it. `stories.ts` holds
   * both halves: the indexer that turns the list into entries, and the plugin
   * that serves the module each entry imports.
   */
  stories: ["../playground/scenarios.ts"],
  experimental_indexers: (indexers) => [...(indexers ?? []), playgroundStoryIndexer],
  /**
   * Imported ahead of `preview.tsx` and of every story module, which is what
   * puts `window.electron` in place before a renderer module can reach for it.
   * The playground's own page holds the same ordering with a second script tag.
   *
   * Absolute, because Storybook resolves a relative annotation against the
   * directory above this one rather than against this file.
   */
  previewAnnotations: [path.join(import.meta.dirname, "..", "playground", "fake-electron.ts")],
  viteFinal: (config) => ({
    ...config,
    plugins: [...(config.plugins ?? []), viteTailwindcss(), playgroundStoriesPlugin()],
    resolve: { ...config.resolve, tsconfigPaths: true },
  }),
} satisfies StorybookConfig;
