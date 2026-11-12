import { defineConfig } from "oxlint";
import type { OxlintOverride } from "oxlint";
import core from "ultracite/oxlint/core";
import playwright from "ultracite/oxlint/playwright";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

interface Pattern {
  regex: string;
  message: string;
  allowTypeImports?: boolean;
}

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

// oxlint applies the last matching override's options whole, so a narrower directory repeats every pattern of the wider one.
const layers = [
  restrict(
    ["packages/app/core/**"],
    [
      noElectron,
      ours,
      into("shared", "core imports nothing of ours."),
      notMain,
      notPreload,
      notRenderer,
    ]
  ),
  restrict(
    ["packages/app/shared/**"],
    [noElectron, ours, notMain, notPreload, notRenderer]
  ),
  restrict(["packages/app/main/**"], [electron, notPreload, notRenderer]),
  restrict(["packages/app/main/platform/**"], [notPreload, notRenderer]),
  restrict(
    ["packages/app/main/features/**"],
    [
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
  restrict(["packages/app/preload/**"], [electron, notMain, notRenderer]),
  restrict(["packages/app/preload/*/bridge.ts"], [notMain, notRenderer]),
  restrict(["packages/app/renderer/**"], [noElectron, notMain, notPreload]),
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
