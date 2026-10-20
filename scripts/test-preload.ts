import { plugin } from "bun";
import { importsLinguiMacro, transformLinguiMacro } from "./lib/lingui-macro";

/*
 * A Lingui macro throws when it runs uncompiled, so `bun test` compiles it with
 * the same native transformer the build uses, before Bun strips the types.
 */
plugin({
  name: "lingui-macro",
  setup(build) {
    build.onLoad({ filter: /^(?!.*\/node_modules\/).*\.tsx?$/ }, async ({ path }) => {
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
await import("@meru/shared/i18n");
