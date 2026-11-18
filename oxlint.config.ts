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
      // Gmail's preload runs in every Gmail page and is held to a byte budget;
      // the budget alone would let zod in under it.
      files: ["src/preload/gmail/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "#contract/gmail.ts",
                message:
                  "Gmail's preload checks messages with #contract/gmail-channels.ts, which carries no zod.",
              },
            ],
            patterns: [
              {
                regex: "^zod(/|$)",
                message: "Gmail's preload bundles no zod.",
              },
              NO_RELATIVE_CROSSING,
            ],
          },
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
      files: ["src/contract/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "electron",
                message:
                  "contract imports nothing of Electron, types included.",
              },
            ],
            patterns: [
              {
                regex: "^#(?!core/)",
                message: "contract imports only core.",
              },
              NO_RELATIVE_CROSSING,
            ],
          },
        ],
      },
    },
    {
      // Catches a renderer's text left unwrapped for translation: a JSX text
      // child, or a literal in an attribute a person reads. Copy in any other
      // attribute, and in main, is left to review.
      files: ["src/**/*.tsx"],
      rules: {
        "react/jsx-no-literals": [
          "error",
          {
            noStrings: true,
            ignoreProps: true,
            restrictedAttributes: ["aria-label", "title", "alt", "placeholder"],
            allowedStrings: ["Meru"],
            // Lingui's macro, whose children are the message, links included.
            elementOverrides: { Trans: { allowElement: true } },
          },
        ],
      },
    },
    {
      // The shadcn CLI writes these components, and they stay as it writes
      // them, so the rules its style breaks are off here. A label is tied to
      // its control where it is used, through `htmlFor`. Their few literal
      // strings, such as Dialog's screen-reader "Close", are English only, so
      // nothing of ours shows a part that holds one.
      files: ["src/ui/**"],
      rules: {
        "jsx-a11y/label-has-associated-control": "off",
        "jsx-a11y/prefer-tag-over-role": "off",
        "jsx-a11y/click-events-have-key-events": "off",
        "jsx-a11y/no-noninteractive-element-interactions": "off",
        "react/jsx-no-literals": "off",
        "func-style": "off",
        "no-use-before-define": "off",
        "import/consistent-type-specifier-style": "off",
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
