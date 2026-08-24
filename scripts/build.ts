import { rm, watch } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import postcssTailwind from "@tailwindcss/postcss";
import viteTailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { type Subprocess, spawn } from "bun";
import postcss from "postcss";
import { rolldown, defineConfig as defineRolldownConfig } from "rolldown";
import * as vite from "vite";

const args = parseArgs({
  args: Bun.argv,
  options: {
    dev: {
      type: "boolean",
    },
    devtools: {
      type: "boolean",
      short: "d",
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
            ...(process.env.APPLE_TEAM_ID
              ? {
                  "process.env.APPLE_TEAM_ID": JSON.stringify(process.env.APPLE_TEAM_ID),
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
              code: `export default ${JSON.stringify(content)};`,
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

  // Runs inside extensions rather than in Meru, so it is bundled like a preload
  // and copied into every extension the loader derives
  const buildExtensionsChromeFacade = () =>
    rolldown({
      ...rolldownOptions,
      input: "./packages/electron-extensions/facade/index.ts",
      platform: "browser",
      transform: {
        ...rolldownOptions.transform,
        target: browserTarget,
      },
    }).then((bundle) =>
      bundle.write({
        file: path.join(process.cwd(), "build-js", "extensions-chrome-facade.js"),
        codeSplitting: false,
        format: "iife",
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
    buildPreloadFile("preload-workspace-app"),
    buildPreloadFile("preload-renderer"),
    buildExtensionsChromeFacade(),
  ]);
}

async function buildRenderer(rendererName: string, port: number) {
  const rendererRoot = path.join(process.cwd(), "packages", rendererName);

  const pageFileNames = Array.from(new Bun.Glob("*.html").scanSync(rendererRoot));

  const viteConfig: vite.InlineConfig = {
    configFile: false,
    root: rendererRoot,
    base: "./",
    plugins: [viteReact(), viteTailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      port,
    },
    build: {
      outDir: path.join(process.cwd(), "build-js", rendererName),
      target: browserTarget,
      rollupOptions: {
        input: pageFileNames.map((pageFileName) => path.join(rendererRoot, pageFileName)),
      },
    },
    clearScreen: false,
  };

  if (args.values.dev) {
    const viteServer = await vite.createServer(viteConfig);

    await viteServer.listen();

    viteServer.printUrls();

    return viteServer.resolvedUrls?.local[0];
  }

  await vite.build(viteConfig);
}

const [, rendererUrl] = await Promise.all([buildAppFiles(), buildRenderer("renderer", 3000)]);

if (args.values.dev) {
  let electron: Subprocess;
  let isRestartingElectron = false;

  const startElectron = () => {
    electron = spawn(["electron", ".", ...(args.values.devtools ? ["--devtools"] : [])], {
      env: { ...process.env, MERU_RENDERER_URL: rendererUrl },
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
    const rendererPathnames = ["renderer/", "shared/renderer/", "ui/"];

    if (rendererPathnames.some((pathname) => event.filename?.startsWith(pathname))) {
      continue;
    }

    await buildAppFiles();

    await restartElectron();
  }
}
