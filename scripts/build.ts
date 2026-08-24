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

// Keep in sync with Electron
const browserTarget = "chrome146";

export function resetBuildDirectory() {
  return rm("./build-js", { recursive: true, force: true });
}

export function buildAppFiles({ dev }: { dev: boolean }) {
  const rolldownOptions = defineRolldownConfig({
    external: ["electron"],
    transform: {
      define: {
        // These outputs are CommonJS, where `import.meta` is not valid syntax,
        // so it is replaced with an empty object either way. Saying so is what
        // stops every build warning once per occurrence in a dependency —
        // hundreds of lines from zustand alone, enough to block a parent
        // process reading the build's output through a pipe.
        "import.meta": "{}",
        ...(!dev
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
          : {}),
      },
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

type RendererServerOptions = {
  /**
   * Fail rather than take the next free port. For a caller that was told which
   * port to use and is waiting on that exact URL, moving to another one leaves
   * it waiting for something that will never answer.
   */
  strictPort?: boolean;
  /**
   * Where Vite keeps its pre-bundled dependencies. Worth overriding for a
   * server that starts while a previous one is still shutting down: they share
   * `node_modules/.vite` by default, and the optimizer deadlocks on it, so the
   * new server never finishes listening.
   */
  cacheDir?: string;
};

function createRendererViteConfig(
  rendererName: string,
  port: number,
  { strictPort = false, cacheDir }: RendererServerOptions = {},
): vite.InlineConfig {
  const rendererRoot = path.join(process.cwd(), "packages", rendererName);

  const pageFileNames = Array.from(new Bun.Glob("*.html").scanSync(rendererRoot));

  return {
    configFile: false,
    root: rendererRoot,
    base: "./",
    cacheDir,
    plugins: [viteReact(), viteTailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      // Pinned to one stack: "localhost" resolves to both 127.0.0.1 and ::1,
      // and Vite's free-port probe claims only one of them, so simultaneous
      // dev servers can each believe they own the same port.
      host: "127.0.0.1",
      port,
      strictPort,
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
}

export function buildRenderer(rendererName: string, port: number) {
  return vite.build(createRendererViteConfig(rendererName, port));
}

/**
 * Resolves once the server is listening, so `resolvedUrls` carries the port it
 * actually took rather than the one it was asked for.
 */
export async function startRendererDevServer(
  rendererName: string,
  port: number,
  options: RendererServerOptions = {},
) {
  const viteServer = await vite.createServer(createRendererViteConfig(rendererName, port, options));

  await viteServer.listen();

  return viteServer;
}

// Guarded so the boot smoke test can import the builders and run the dev server
// in its own process. `_electron.launch` has to spawn the app itself, which the
// branch below already does, so the two cannot both drive it.
if (import.meta.main) {
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

  const isDev = args.values.dev === true;

  await resetBuildDirectory();

  if (!isDev) {
    await Promise.all([buildAppFiles({ dev: false }), buildRenderer("renderer", 3000)]);
  } else {
    const [, viteServer] = await Promise.all([
      buildAppFiles({ dev: true }),
      startRendererDevServer("renderer", 3000),
    ]);

    viteServer.printUrls();

    const rendererUrl = viteServer.resolvedUrls?.local[0];

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

      await buildAppFiles({ dev: true });

      await restartElectron();
    }
  }
}
