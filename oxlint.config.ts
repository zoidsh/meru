import oxlintConfig from "@timche/oxc-configs/oxlint";
import { defineConfig } from "oxlint";

/*
 * Where every user-visible string is expected to be wrapped in the Lingui
 * macro, and so where an unwrapped one is a bug. The list grows one area at a
 * time as the interface is translated; everywhere else still holds about a
 * thousand unwrapped strings, which would bury everything else lint reports.
 */
const LOCALIZED_FILES = ["packages/preload-gmail/ipc.ts", "packages/preload-gmail/toast.ts"];

export default defineConfig({
  ...oxlintConfig,
  jsPlugins: [{ name: "lingui", specifier: "eslint-plugin-lingui" }],
  rules: {
    ...oxlintConfig.rules,
    // A `t` call at module scope runs once, as the module loads, and keeps
    // whichever language was active then for the life of the process.
    "lingui/t-call-in-function": "error",
    // A placeholder that is not a plain identifier extracts as `{0}`, which
    // tells a translating agent nothing about what goes there.
    "lingui/no-expression-in-message": "error",
  },
  overrides: [
    {
      files: LOCALIZED_FILES,
      rules: {
        "lingui/no-unlocalized-strings": [
          "error",
          {
            ignore: [
              "^[A-Z_]+$",
              "^[a-z-]+$",
              // A location hash Meru navigates a Gmail view to.
              "^#",
              // SVG path data, which is geometry rather than text.
              "^[Mm][\\d.,\\s-]+$",
            ],
            ignoreFunctions: [
              "console.*",
              "log.*",
              "openExternalUrl",
              "require",
              // IPC channel names, which are the contract rather than copy.
              "ipc.main.*",
              "ipc.renderer.*",
            ],
            ignoreNames: [
              // A module constant is an id, a namespace or a selector, not copy.
              { regex: { pattern: "^[A-Z][A-Z0-9_]*$" } },
              "type",
              "role",
              "id",
              "accelerator",
              "className",
              "key",
              "partition",
              "defaultId",
              "cancelId",
              "configKey",
              "stroke",
            ],
          },
        ],
      },
    },
  ],
});
