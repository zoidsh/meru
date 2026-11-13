import { defineConfig } from "oxlint";
import type { OxlintOverride } from "oxlint";
import core from "ultracite/oxlint/core";
import playwright from "ultracite/oxlint/playwright";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

type Pattern = {
  message: string;
  allowTypeImports?: boolean;
} & ({ regex: string } | { group: string[] });

// A specifier crosses into a layer when one of its path segments names it; imports are relative, so the segment is the layer.
const layer = (name: string) => `(^|/)${name}(/|$)`;

const electron: Pattern = {
  allowTypeImports: true,
  message:
    "Only main/platform and a preload's bridge.ts value-import electron.",
  regex: "^electron(/|$)",
};
const noElectron: Pattern = {
  message: "This layer never sees electron, not even its types.",
  regex: "^electron(/|$)",
};
const ours: Pattern = {
  message: "Leaf packages are not imported here.",
  regex: "^@meru/",
};
const scriptsOnly: Pattern = {
  message: "execa serves scripts/ and tests/, not the app.",
  regex: "^execa(/|$)",
};
const into = (
  name: string,
  message: string,
  allowTypeImports = false
): Pattern => ({
  allowTypeImports,
  message,
  regex: layer(name),
});

const notMain = into("main", "Preloads and renderer pages never import main.");
const notPreload = into("preload", "Only a preload imports its own files.");
const notRenderer = into(
  "renderer",
  "Only the renderer imports its own files."
);

const restrict = (files: string[], patterns: Pattern[]): OxlintOverride => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns }] },
});

// A feature's settings.ts and commands.ts are its half of a contract every page reads: the registries in shared assemble them, so they import what shared may and nothing else of the feature.
const contract: Pattern[] = [
  noElectron,
  ours,
  notPreload,
  notRenderer,
  into("shell", "A contract file imports no shell."),
  into("platform", "A contract file imports no platform."),
  {
    message: "A contract file imports nothing else of its feature.",
    regex: "^\\./",
  },
  {
    message: "A contract file imports nothing of another feature.",
    regex: "^\\.\\./[^.]",
  },
];

// A group, not a regex: oxlint's regex has no lookahead, and the exception is two file names.
const registry: Pattern = {
  group: [
    "**/main/**",
    "!**/main/features/*/settings.ts",
    "!**/main/features/*/commands.ts",
  ],
  message:
    "A registry assembles features' settings.ts and commands.ts and imports nothing else of main.",
};

// oxlint applies the last matching override's options whole, so a narrower directory repeats every pattern of the wider one.
const layers = [
  restrict(
    ["app/core/**"],
    [
      scriptsOnly,
      noElectron,
      ours,
      into("shared", "core imports nothing of ours."),
      notMain,
      notPreload,
      notRenderer,
    ]
  ),
  restrict(
    ["app/shared/**"],
    [scriptsOnly, noElectron, ours, notMain, notPreload, notRenderer]
  ),
  restrict(["app/main/**"], [scriptsOnly, electron, notPreload, notRenderer]),
  restrict(["app/main/platform/**"], [scriptsOnly, notPreload, notRenderer]),
  restrict(
    ["app/main/features/**"],
    [
      scriptsOnly,
      electron,
      notPreload,
      notRenderer,
      into("shell", "Features never import the shell; it imports them."),
      into(
        "platform",
        "Features take platform through a port, never its values.",
        true
      ),
    ]
  ),
  // A feature's test assembles it as the composition root does, over the shell's real IPC and command dispatchers.
  restrict(
    ["app/main/features/**/*.test.ts"],
    [
      scriptsOnly,
      electron,
      notPreload,
      notRenderer,
      into(
        "platform",
        "Features take platform through a port, never its values.",
        true
      ),
    ]
  ),
  restrict(
    ["app/shared/*/registry.ts"],
    [scriptsOnly, noElectron, ours, notPreload, notRenderer, registry]
  ),
  restrict(
    ["app/main/features/*/settings.ts", "app/main/features/*/commands.ts"],
    [scriptsOnly, ...contract]
  ),
  restrict(["app/preload/**"], [scriptsOnly, electron, notMain, notRenderer]),
  restrict(["app/preload/*/bridge.ts"], [scriptsOnly, notMain, notRenderer]),
  restrict(["app/renderer/**"], [scriptsOnly, noElectron, notMain, notPreload]),
];

export default defineConfig({
  env: core.env,
  extends: [core, react, vitest, playwright],
  ignorePatterns: core.ignorePatterns,
  options: { typeAware: true },
  overrides: layers,
  rules: {
    "import/no-cycle": ["error", { ignoreTypes: false }],
  },
});
