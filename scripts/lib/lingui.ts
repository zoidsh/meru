import { lingui } from "@lingui/vite-plugin";
import type { Plugin } from "rolldown";

/**
 * Lingui's Vite plugin, for the bundles rolldown builds itself: the macro
 * transform and the `.po` loader that the shell gets from Vite. Its macro
 * transform reads `this.environment.config.isProduction`, which only Vite
 * provides, to decide whether a compiled message keeps its source text; each
 * hook is handed the one fact rolldown cannot give it.
 */
export const linguiForRolldown = (isProduction: boolean): Plugin[] => {
  const environment = { config: { isProduction } };

  return lingui({ macroTransform: true }).map((vitePlugin) => {
    // Vite types its hooks' context as rolldown's plus `environment`.
    const plugin = vitePlugin as unknown as Plugin;
    const { transform } = plugin;

    if (!transform || typeof transform === "function") {
      return plugin;
    }

    return {
      ...plugin,
      transform: {
        ...transform,
        handler(code, id, meta) {
          return transform.handler.call(
            Object.assign(Object.create(this) as typeof this, { environment }),
            code,
            id,
            meta
          );
        },
      },
    };
  });
};
