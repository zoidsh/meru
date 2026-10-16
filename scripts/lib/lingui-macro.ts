import { transform } from "@lingui/native-tools";
import type { Plugin } from "rolldown";

const MACRO_MODULE_SPECIFIERS = ["@lingui/core/macro", "@lingui/react/macro"];

/*
 * Compiles Lingui macros in the bundles rolldown builds itself, which is every
 * one but the renderer's: the Vite plugin only reaches that one. The native
 * transformer is an SWC pass with the macro baked in, so it needs neither Babel
 * nor the SWC plugin system; it strips TypeScript syntax on the way, which
 * rolldown then takes as the module's source.
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
        const { code: transformedCode, map } = await transform(code, id);

        return { code: transformedCode, map };
      },
    },
  };
}
