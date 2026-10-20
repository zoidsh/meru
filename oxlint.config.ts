import oxlintConfig from "@timche/oxc-configs/oxlint";
import { defineConfig } from "oxlint";

/*
 * Where every user-visible string is expected to be wrapped in the Lingui
 * macro, and so where an unwrapped one is a bug. The list grows one area at a
 * time as the interface is translated; everywhere else still holds about a
 * thousand unwrapped strings, which would bury everything else lint reports.
 */
const LOCALIZED_FILES = [
  "packages/app/account.ts",
  "packages/app/context-menu.ts",
  "packages/app/dialogs.ts",
  "packages/app/do-not-disturb.ts",
  "packages/app/downloads.ts",
  "packages/app/gmail/index.ts",
  "packages/app/ipc.ts",
  "packages/app/lib/extension-swap.ts",
  "packages/app/lib/extension-window.ts",
  "packages/app/license-key.ts",
  "packages/app/menu.ts",
  "packages/app/protocol/index.ts",
  "packages/app/trial.ts",
  "packages/app/tray.ts",
  "packages/app/url.ts",
  "packages/app/workspace-app.ts",
  "packages/preload-gmail/ipc.ts",
  "packages/preload-gmail/toast.ts",
  "packages/renderer/routes/settings/language-field.tsx",
];

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
    // A message that is only a placeholder or only a tag leaves a translator
    // nothing to translate.
    "lingui/no-single-variables-to-translate": "error",
    "lingui/no-single-tag-to-translate": "error",
    "lingui/no-trans-inside-trans": "error",
    // A `lingui-set` directive applies to every message below it in the file
    // until a `lingui-reset` closes it.
    "lingui/require-directive-reset": "error",
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
              // A camelCase or snake_case value is an identifier: an action,
              // an open behavior, a query parameter.
              "^[a-z]+(?:[A-Z][a-z0-9]*)+$",
              "^[a-z]+(?:_[a-z]+)+$",
              // An IPC channel, named `domain.verbNoun`.
              "^[a-z][A-Za-z]*\\.[a-z][A-Za-z]*$",
            ],
            ignoreFunctions: [
              "console.*",
              "log.*",
              "openExternalUrl",
              "require",
              // IPC channel names, which are the contract rather than copy.
              "ipc.main.*",
              "ipc.renderer.*",
              "this.main.*",
              // Class names.
              "cn",
              "cva",
              "clsx",
              // Config keys.
              "config.get",
              "config.set",
              "config.onDidChange",
              // `new URL(…)`, whose callee the rule matches like a call's.
              "URL",
              // A thrown error is for the log, and its message is never shown.
              "Error",
              "steps.log.*",
              "logLoadFailures",
              // Durations.
              "ms",
              // Routes, URLs, paths and the commands run on them.
              "main.navigate",
              "loadUrl",
              "searchParams.set",
              "*.createComposeWindow",
              "*.startsWith",
              "*.includes",
              "*.fetch",
              "*.executeJavaScript",
              "*.setUserAgent",
              "session.fromPartition",
              "nativeImage.createFromDataURL",
              "path.join",
              "fs.readFileSync",
              "execFile",
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
              "duration",
              "url",
              "defaultPath",
              { regex: { pattern: "^iconFileName" } },
            ],
          },
        ],
      },
    },
  ],
});
