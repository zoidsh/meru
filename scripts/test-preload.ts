import fs from "node:fs";
import path from "node:path";

/*
 * `@meru/shared/i18n` imports the compiled catalogs, which are generated and
 * gitignored, so a fresh checkout has none until `lingui compile` runs. A
 * preload compiles them before any test file loads, so every way of running
 * `bun test` works without a script in front of it.
 */

const repositoryRoot = path.join(import.meta.dirname, "..");
const localesDir = path.join(repositoryRoot, "packages", "shared", "i18n", "locales");

function isCatalogStale(poFile: string) {
  const compiledFile = path.join(localesDir, `${path.basename(poFile, ".po")}.ts`);

  if (!fs.existsSync(compiledFile)) {
    return true;
  }

  return fs.statSync(compiledFile).mtimeMs < fs.statSync(path.join(localesDir, poFile)).mtimeMs;
}

const poFiles = fs.readdirSync(localesDir).filter((file) => file.endsWith(".po"));

if (poFiles.some(isCatalogStale)) {
  const { exitCode } = Bun.spawnSync(["bun", "run", "i18n:compile"], {
    cwd: repositoryRoot,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (exitCode !== 0) {
    throw new Error("Compiling the Lingui catalogs failed");
  }
}
