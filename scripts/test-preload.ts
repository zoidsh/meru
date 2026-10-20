import { plugin } from "bun";
import { importsLinguiMacro, transformLinguiMacro } from "./lib/lingui-macro";

/*
 * A Lingui macro throws when it runs uncompiled, so `bun test` compiles it with
 * the same native transformer the build uses, before Bun strips the types.
 */
plugin({
  name: "lingui-macro",
  setup(build) {
    build.onLoad({ filter: /^(?!.*[\\/]node_modules[\\/]).*\.tsx?$/ }, async ({ path }) => {
      const loader = path.endsWith(".tsx") ? "tsx" : "ts";

      const code = await Bun.file(path).text();

      if (!importsLinguiMacro(code)) {
        return { contents: code, loader };
      }

      const { code: transformedCode } = await transformLinguiMacro(code, path);

      return { contents: transformedCode, loader };
    });
  },
});

// Activates English, which a macro call needs before it can look a message up.
// The compiled catalogs are gitignored, so a fresh checkout has none.
try {
  await import("@meru/shared/i18n");
} catch (error) {
  if (error instanceof Error && error.message.includes("./locales/en")) {
    // Exits rather than throws, since `--isolate` would report it once per file.
    console.error(
      "The Lingui catalogs aren't compiled. Run `bun run i18n:compile` once, or run the tests with `bun run test`, which compiles them first.",
    );

    process.exit(1);
  }

  throw error;
}
