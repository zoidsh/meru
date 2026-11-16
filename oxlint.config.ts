import { readdirSync } from "node:fs";

import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

const AREAS = readdirSync(new URL("src", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** A relative path that climbs out of the importing file's area into another. */
const NO_RELATIVE_CROSSING = {
  regex: String.raw`^(\.\./)+(${AREAS.join("|")})/`,
  message: "Import another area through its # alias, such as #core/….",
};

const ELECTRON_TYPES_ONLY = {
  name: "electron",
  allowTypeImports: true,
  message:
    "Only platform and the preloads import Electron by value; reach it through a platform adapter.",
};

export default defineConfig({
  extends: [core, react, vitest],
  overrides: [
    {
      files: ["src/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          { paths: [ELECTRON_TYPES_ONLY], patterns: [NO_RELATIVE_CROSSING] },
        ],
      },
    },
    {
      files: ["src/platform/**", "src/preload/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          { patterns: [NO_RELATIVE_CROSSING] },
        ],
      },
    },
    {
      files: ["src/core/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "electron",
                message: "core imports nothing of Electron, types included.",
              },
            ],
            patterns: [
              { regex: "^#", message: "core imports no other area." },
              NO_RELATIVE_CROSSING,
            ],
          },
        ],
      },
    },
    {
      files: ["e2e/**"],
      rules: {
        "no-restricted-properties": [
          "error",
          ...[
            "locator",
            "frameLocator",
            "getByTestId",
            "$",
            "$$",
            "$eval",
            "$$eval",
            "waitForSelector",
          ].map((property) => ({
            property,
            message:
              "Find it through the accessibility tree: getByRole with a name, or getByLabel or getByText.",
          })),
        ],
        // A Playwright fixture must destructure its first argument even when
        // it needs no other fixture, and its `use` is not React's hook.
        "no-empty-pattern": "off",
        "react-hooks/rules-of-hooks": "off",
      },
    },
    {
      // `${productName}` and the like are electron-builder's own macros.
      files: ["electron-builder.config.ts"],
      rules: {
        "no-template-curly-in-string": "off",
      },
    },
  ],
});
