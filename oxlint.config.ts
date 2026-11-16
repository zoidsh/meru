import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

const ELECTRON_MODULES = [
  "electron",
  "electron/main",
  "electron/common",
  "electron/renderer",
];

const electronImports = (
  allowTypeImports: boolean,
  message: string
): [
  "error",
  { paths: { name: string; allowTypeImports: boolean; message: string }[] },
] => [
  "error",
  {
    paths: ELECTRON_MODULES.map((name) => ({
      name,
      allowTypeImports,
      message,
    })),
  },
];

export default defineConfig({
  extends: [core, react, vitest],
  overrides: [
    {
      files: ["packages/**"],
      rules: {
        "no-restricted-imports": electronImports(
          true,
          "Only @meru/platform imports Electron by value; reach it through an adapter there."
        ),
      },
    },
    {
      files: ["packages/core/**", "packages/contract/**"],
      rules: {
        "no-restricted-imports": electronImports(
          false,
          "@meru/core and @meru/contract are pure and import nothing of Electron, types included."
        ),
      },
    },
    {
      files: ["packages/platform/**"],
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
});
