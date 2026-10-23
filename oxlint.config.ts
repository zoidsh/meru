import oxlintConfig from "@timche/oxc-configs/oxlint";
import { defineConfig } from "oxlint";

/*
 * Linted file by file rather than by directory: most of `@meru/shared` is data
 * that stays English, such as the workspace app names, and most of the Gmail
 * preload is selectors and CSS.
 */
const LOCALIZED_FILES = [
  "packages/preload-gmail/ipc.ts",
  "packages/preload-gmail/toast.ts",
  "packages/shared/accounts.ts",
  "packages/shared/schemas.ts",
  "packages/shared/tabs.ts",
  "packages/shared/verification-codes.ts",
];

const NO_UNLOCALIZED_STRINGS_OPTIONS = {
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
    "*.logGesture",
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
    "writeFile",
    "execFile",
    "createMeruApiSafeClient",
    "shell.openExternal",
    "fetch",
    "useRoute",
    "navigate",
    // CSS selectors, and the colors and image URLs the dark theme matches.
    "*.querySelector",
    "*.closest",
    "$",
    "$$",
    "applyDarkTheme",
    // Keyboard shortcuts, named by their keys.
    "useHotkeys",
    // Names a platform API defines: DOM events, canvas contexts, Chromium
    // switches and Windows registry keys.
    "*.addEventListener",
    "*.getContext",
    "app.commandLine.appendSwitch",
    "queryUserChoiceProgIds",
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
    "urls",
    "defaultPath",
    "keychainAccessGroup",
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
};

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
      files: [
        "packages/app/**",
        "packages/preload-renderer/**",
        "packages/preload-workspace-app/**",
        "packages/renderer/**",
        ...LOCALIZED_FILES,
      ],
      excludeFiles: [
        "**/*.test.{ts,tsx}",
        "**/*.e2e.ts",
        // Files whose strings are data: blocked hosts, SVG ids, window manager
        // names, system paths, URL patterns and attribute values.
        "packages/app/blocker/hosts.ts",
        "packages/app/extensions.ts",
        "packages/app/lib/deep-link.ts",
        "packages/app/lib/linux.ts",
        "packages/app/lib/machine-id/**",
        "packages/app/lib/quarantine.ts",
        "packages/app/lib/window.ts",
        "packages/renderer/components/workspace-app-icon.tsx",
      ],
      rules: {
        "lingui/no-unlocalized-strings": ["error", NO_UNLOCALIZED_STRINGS_OPTIONS],
      },
    },
  ],
});
