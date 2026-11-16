import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

/*
 * The import boundaries between workspace packages. An override replaces a
 * rule's options rather than merging them, so each scope below states its
 * whole set.
 */

interface RestrictedPath {
  name: string;
  message: string;
  allowTypeImports?: boolean;
  importNames?: string[];
}

interface RestrictedPattern {
  message: string;
  group?: string[];
  regex?: string;
}

type ImportRestriction = [
  "error",
  { paths: RestrictedPath[]; patterns: RestrictedPattern[] },
];

const NO_NODE_MODULE: RestrictedPath[] = ["node:module", "module"].map(
  (name) => ({
    name,
    message:
      "node:module loads modules past the import boundaries; only scripts/ may use it.",
  })
);

/*
 * Without a resolver the rule sees only the specifier. Source lives one level
 * down in each package's `src`, so climbing two levels is the only way a
 * relative path reaches another package, however its separators and `.`
 * segments are spelled, and an absolute one always can.
 */
const NO_TUNNELS: RestrictedPattern[] = [
  {
    regex: String.raw`(^|[/\\])\.\.([/\\]+(\.[/\\]+)*)\.\.([/\\]|$)`,
    message:
      "Import another workspace package by its @meru/ name, never by a relative path out of this package.",
  },
  {
    regex: String.raw`^([/\\]|[A-Za-z]:|file:)`,
    message: "Import by package name or a path relative to this file.",
  },
];

const ELECTRON = "electron";

const DEEP_ELECTRON: RestrictedPattern = {
  regex: String.raw`^electron[/\\]`,
  message: "Import Electron as `electron`, and only in @meru/platform.",
};

const restrict = ({
  electron,
  workspace = [],
}: {
  electron: "value" | "type" | "none";
  workspace?: RestrictedPattern[];
}): ImportRestriction => {
  const electronRules: {
    paths: RestrictedPath[];
    patterns: RestrictedPattern[];
  } = {
    value: { paths: [], patterns: [] },
    type: {
      paths: [
        {
          name: ELECTRON,
          allowTypeImports: true,
          message:
            "Only @meru/platform and the preloads import Electron by value; reach it through a platform adapter.",
        },
      ],
      patterns: [DEEP_ELECTRON],
    },
    none: {
      paths: [
        {
          name: ELECTRON,
          message:
            "@meru/core and @meru/contract are pure and import nothing of Electron, types included.",
        },
      ],
      patterns: [DEEP_ELECTRON],
    },
  }[electron];

  return [
    "error",
    {
      paths: [...NO_NODE_MODULE, ...electronRules.paths],
      patterns: [...NO_TUNNELS, ...electronRules.patterns, ...workspace],
    },
  ];
};

/** Habits that find an element by CSS, XPath or a test id rather than by role. */
const NO_SELECTORS: ["error", ...{ property: string; message: string }[]] = [
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
];

/** `require` reaches past the import boundaries; only scripts/ may use it. */
const NO_REQUIRE: ["error", string] = ["error", "require"];

export default defineConfig({
  extends: [core, react, vitest],
  rules: {
    "no-restricted-imports": ["error", { paths: NO_NODE_MODULE, patterns: [] }],
    "no-restricted-globals": NO_REQUIRE,
    "typescript/no-require-imports": "error",
  },
  overrides: [
    {
      files: ["scripts/**"],
      rules: {
        "no-restricted-imports": "off",
        "no-restricted-globals": "off",
        "typescript/no-require-imports": "off",
      },
    },
    {
      files: ["e2e/**"],
      rules: {
        "no-restricted-properties": NO_SELECTORS,
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
    {
      files: ["packages/**"],
      rules: {
        "no-restricted-imports": restrict({ electron: "type" }),
      },
    },
    {
      files: ["packages/platform/**", "packages/preload-*/**"],
      rules: {
        "no-restricted-imports": restrict({ electron: "value" }),
      },
    },
    {
      files: ["packages/core/**"],
      rules: {
        "no-restricted-imports": restrict({
          electron: "none",
          workspace: [
            {
              group: ["@meru/**"],
              message: "@meru/core imports no other workspace package.",
            },
          ],
        }),
      },
    },
    {
      files: ["packages/contract/**"],
      rules: {
        "no-restricted-imports": restrict({
          electron: "none",
          workspace: [
            {
              group: ["@meru/**", "!@meru/core", "!@meru/core/**"],
              message: "@meru/contract imports only @meru/core.",
            },
          ],
        }),
      },
    },
  ],
});
