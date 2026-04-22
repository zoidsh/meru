import { rm, watch } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import postcssTailwind from "@tailwindcss/postcss";
import viteTailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { type Subprocess, spawn } from "bun";
import * as vite from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { rolldown, defineConfig as defineRolldownConfig } from "rolldown";
import postcss from "postcss";

const args = parseArgs({
  args: Bun.argv,
  options: {
    dev: {
      type: "boolean",
    },
  },
  strict: true,
  allowPositionals: true,
});

await rm("./build-js", { recursive: true, force: true });

// Keep in sync with Electron
const browserTarget = "chrome146";

function buildAppFiles() {
  const rolldownOptions = defineRolldownConfig({
    external: ["electron"],
    transform: {
      define: !args.values.dev
        ? {
            "process.env.NODE_ENV": JSON.stringify("production"),
            ...(process.env.MERU_API_URL
              ? {
                  "process.env.MERU_API_URL": JSON.stringify(process.env.MERU_API_URL),
                }
              : {}),
          }
        : undefined,
    },
  });

  const buildPreloadFile = (preloadName: string) =>
    rolldown({
      ...rolldownOptions,
      input: `./packages/${preloadName}/index.ts`,
      platform: "browser",
      transform: {
        ...rolldownOptions.transform,
        target: browserTarget,
      },
      plugins: [
        {
          name: "css-loader",
          load: async (id) => {
            if (!id.endsWith(".css")) {
              return null;
            }

            const content = await postcss()
              .use(postcssTailwind())
              .process(await Bun.file(id).text(), { from: id })
              .then((result) => result.css);

            return {
              code: `export default \`${content}\`;`,
              moduleType: "js",
            };
          },
        },
      ],
    }).then((bundle) =>
      bundle.write({
        file: path.join(process.cwd(), "build-js", `${preloadName}.js`),
        codeSplitting: false,
        format: "cjs",
      }),
    );

  return Promise.all([
    rolldown({
      ...rolldownOptions,
      input: "./packages/app/index.ts",
      platform: "node",
      transform: {
        ...rolldownOptions.transform,
        target: "node24",
      },
      moduleTypes: {
        ".css": "text",
      },
    }).then((bundle) =>
      bundle.write({
        file: path.join(process.cwd(), "build-js", "app.js"),
        format: "cjs",
      }),
    ),
    buildPreloadFile("preload-gmail"),
    buildPreloadFile("preload-google-app"),
    buildPreloadFile("preload-renderer"),
  ]);
}

async function buildRenderer(rendererName: string, port: number) {
  const viteConfig: vite.InlineConfig = {
    configFile: false,
    root: path.join(process.cwd(), "packages", rendererName),
    plugins: [viteReact(), viteTailwindcss(), viteSingleFile()],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      port,
      strictPort: true,
    },
    build: {
      outDir: path.join(process.cwd(), "build-js", rendererName),
      target: browserTarget,
    },
    clearScreen: false,
  };

  if (args.values.dev) {
    const viteServer = await vite.createServer(viteConfig);

    await viteServer.listen();

    viteServer.printUrls();
  } else {
    await vite.build(viteConfig);
  }
}

await Promise.all([
  buildAppFiles(),
  buildRenderer("renderer", 3000),
  buildRenderer("renderer-popup", 3001),
]);

if (args.values.dev) {
  let electron: Subprocess;
  let isRestartingElectron = false;

  const startElectron = () => {
    electron = spawn(["electron", "."], {
      onExit: async () => {
        if (isRestartingElectron) {
          isRestartingElectron = false;
        } else {
          await electron.exited;

          process.exit(0);
        }
      },
    });
  };

  const stopElectron = () => {
    electron.kill();

    return electron.exited;
  };

  const restartElectron = async () => {
    isRestartingElectron = true;

    await stopElectron();

    startElectron();
  };

  await startElectron();

  const watcher = watch("./packages", { recursive: true });

  for await (const event of watcher) {
    if (
      ["renderer/", "renderer-popup/", "ui/"].some((pathname) => event.filename?.includes(pathname))
    ) {
      continue;
    }

    await buildAppFiles();

    await restartElectron();
  }
}
