import { getConfig } from "@lingui/conf";
import { type LinguiMacroOptions, mapMacroOptions, transform } from "@lingui/native-tools";
import type { Plugin } from "rolldown";

const MACRO_MODULE_SPECIFIERS = ["@lingui/core/macro", "@lingui/react/macro"];

let macroOptions: LinguiMacroOptions | undefined;

function getMacroOptions() {
  macroOptions ??= mapMacroOptions(getConfig());

  return macroOptions;
}

/*
 * Compiles Lingui macros in the bundles rolldown builds itself, which is every
 * one but the renderer's: the Vite plugin only reaches that one. The native
 * transformer is an SWC pass with the macro baked in, so it needs neither Babel
 * nor the SWC plugin system; it strips TypeScript syntax on the way, which
 * rolldown then takes as the module's source. It takes the macro options from
 * the Lingui config, as the Vite plugin does, so a macro compiles the same in
 * every bundle.
 *
 * `@lingui/native-tools` is 0.x. The fallback is the route Lingui's own docs
 * give for rolldown, `@rolldown/plugin-babel` running
 * `@lingui/babel-plugin-lingui-macro`, which produces the same output for a
 * couple of hundred milliseconds more per build; neither package is installed
 * while this one works.
 */
export function linguiMacro(): Plugin {
  return {
    name: "lingui-macro",
    transform: {
      filter: {
        id: /\.[cm]?[jt]sx?$/,
        code: {
          include: MACRO_MODULE_SPECIFIERS.map(
            (specifier) => new RegExp(specifier.replaceAll("/", "\\/")),
          ),
        },
      },
      handler: async (code, id) => {
        const { code: transformedCode, map } = await transform(code, id, {
          macro: getMacroOptions(),
        });

        return { code: transformedCode, map };
      },
    },
  };
}
