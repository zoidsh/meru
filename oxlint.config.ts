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
  "packages/renderer/bookmarks.tsx",
  "packages/renderer/components/app-main.tsx",
  "packages/renderer/components/app-sidebar.tsx",
  "packages/renderer/components/app-titlebar.tsx",
  "packages/renderer/components/config-select-field.tsx",
  "packages/renderer/components/config-switch-field.tsx",
  "packages/renderer/components/download-history.tsx",
  "packages/renderer/components/emoji-picker-button.tsx",
  "packages/renderer/components/find-in-page.tsx",
  "packages/renderer/components/license-key-required-banner.tsx",
  "packages/renderer/components/license-key-required-field-badge.tsx",
  "packages/renderer/components/loading-spinner.tsx",
  "packages/renderer/components/maturity-field-badge.tsx",
  "packages/renderer/components/popup-window.tsx",
  "packages/renderer/components/settings-dialog-content.tsx",
  "packages/renderer/components/titlebar.tsx",
  "packages/renderer/components/vertical-tabs.tsx",
  "packages/renderer/components/workspace-apps-launcher.tsx",
  "packages/renderer/desktop-sources.tsx",
  "packages/renderer/lib/extension-descriptions.ts",
  "packages/renderer/lib/notifications/index.ts",
  "packages/renderer/lib/settings-pages.ts",
  "packages/renderer/lib/toast.ts",
  "packages/renderer/main.tsx",
  "packages/renderer/recent-download-history.tsx",
  "packages/renderer/routes/download-history.tsx",
  "packages/renderer/routes/settings/about.tsx",
  "packages/renderer/routes/settings/accounts.tsx",
  "packages/renderer/routes/settings/advanced.tsx",
  "packages/renderer/routes/settings/appearance.tsx",
  "packages/renderer/routes/settings/blocker.tsx",
  "packages/renderer/routes/settings/downloads.tsx",
  "packages/renderer/routes/settings/extensions.tsx",
  "packages/renderer/routes/settings/general.tsx",
  "packages/renderer/routes/settings/gmail/index.tsx",
  "packages/renderer/routes/settings/gmail/label-colors.tsx",
  "packages/renderer/routes/settings/language-field.tsx",
  "packages/renderer/routes/settings/languages.tsx",
  "packages/renderer/routes/settings/license.tsx",
  "packages/renderer/routes/settings/notifications.tsx",
  "packages/renderer/routes/settings/phishing-protection.tsx",
  "packages/renderer/routes/settings/saved-searches.tsx",
  "packages/renderer/routes/settings/unified-inbox.tsx",
  "packages/renderer/routes/settings/updates.tsx",
  "packages/renderer/routes/settings/verification-codes.tsx",
  "packages/renderer/routes/settings/version-history.tsx",
  "packages/renderer/routes/settings/workspace-apps.tsx",
  "packages/renderer/routes/unified-inbox.tsx",
  "packages/renderer/workspace-app.tsx",
  "packages/shared/accounts.ts",
  "packages/shared/schemas.ts",
  "packages/shared/tabs.ts",
  "packages/shared/verification-codes.ts",
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
              // An HTML heading element, which Markdown's headings are mapped onto.
              "^h[1-6]$",
              // A CSS math function, which is a length rather than text.
              "^(?:calc|max|min)\\(",
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
              "fetch",
              "useRoute",
              "navigate",
              // CSS selectors.
              "*.querySelector",
              // Keyboard shortcuts, named by their keys.
              "useHotkeys",
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
              // A route the renderer navigates to.
              "path",
              // A maturity badge's key, which the badge translates.
              "maturity",
              { regex: { pattern: "^iconFileName" } },
              // `Intl.DateTimeFormat` options, whose values are style keywords.
              "hour",
              "minute",
              "month",
              "day",
              "year",
            ],
          },
        ],
      },
    },
  ],
});
