import oxlintConfig from "@timche/oxc-configs/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  ...oxlintConfig,
  // Meru's renderer is the chrome around Gmail's own interface, not a page of
  // its own, so the accessibility rules have nothing here to speak for.
  plugins: oxlintConfig.plugins.filter((plugin) => plugin !== "jsx-a11y"),
  rules: {
    ...oxlintConfig.rules,
    // The main process is a graph of singletons that reach for each other, and
    // untangling it is its own piece of work — see `docs/todo.md`.
    "import/no-cycle": "off",
  },
  overrides: [
    ...oxlintConfig.overrides,
    {
      // A vendored copy of vercel/ms, kept diffable against upstream.
      files: ["packages/shared/ms.ts"],
      rules: {
        "no-shadow": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/restrict-template-expressions": "off",
        "unicorn/prefer-type-error": "off",
      },
    },
    {
      // The config migrations read and write keys that `Config` no longer has,
      // which is what every `@ts-expect-error` in there is for. A rule that
      // judges those reads by the current type can only be wrong about them.
      files: ["packages/app/config.ts"],
      rules: {
        "typescript/no-unnecessary-condition": "off",
        "typescript/no-unsafe-assignment": "off",
      },
    },
  ],
});
