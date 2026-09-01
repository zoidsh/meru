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
            /*
             * Defined whether or not it is set, unlike the team id below. A
             * define added only when its variable happens to be set leaves the
             * expression itself in the bundle, where the environment answers it
             * at launch — which let a shipped app be pointed at any license
             * server with one variable. An empty string is what the client
             * reads as "use the production URL".
             */
            "process.env.MERU_API_URL": JSON.stringify(process.env.MERU_API_URL ?? ""),
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

  /*
   * Runs inside extensions rather than in Meru, so it is bundled like a preload
   * and copied into every extension the loader derives.
   *
   * Minified where the app's own bundles are not: one of these loads in every
   * extension context — the service worker, each popup and options page, and
   * every inline-menu iframe a page gets — and the facade alone was 26.9 kB
   * against 7.2 kB. Minified in a development build too, so the bytes a
   * developer runs are the bytes that ship. The derive writes the token in
   * front of whatever it is handed, and names the file itself, so nothing
   * downstream reads the output's contents.
   */
  const buildExtensionScript = (inputPath: string, outputFileName: string) =>
    rolldown({
      ...rolldownOptions,
      input: inputPath,
      platform: "browser",
      transform: {
        ...rolldownOptions.transform,
        target: browserTarget,
      },
    }).then((bundle) =>
      bundle.write({
        file: path.join(process.cwd(), "build-js", outputFileName),
        codeSplitting: false,
        format: "iife",
        minify: true,
      }),
    );

  /*
   * The checked-in fixture extension, assembled as a loadable unpacked
   * extension: its scripts bundled like the other extension scripts — rolldown,
   * never `bun build`, whose node polyfills once inflated the shim about 70x —
   * and its static files copied next to them. It ships with the app so the
   * end-to-end flag can only ever enable this directory, not name one.
   */
  const buildFixtureExtension = () => {
    const fixtureDir = path.join(process.cwd(), "packages", "electron-extensions", "fixture");

    const fixtureOutDir = path.join(process.cwd(), "build-js", "fixture-extension");

    const buildFixtureScript = (scriptFileName: string) =>
      rolldown({
        ...rolldownOptions,
        input: path.join(fixtureDir, `${scriptFileName}.ts`),
        platform: "browser",
        transform: {
          ...rolldownOptions.transform,
          target: browserTarget,
        },
      }).then((bundle) =>
        bundle.write({
          file: path.join(fixtureOutDir, `${scriptFileName}.js`),
          codeSplitting: false,
          format: "iife",
        }),
      );

    const copyFixtureFile = (fileName: string) =>
      Bun.write(path.join(fixtureOutDir, fileName), Bun.file(path.join(fixtureDir, fileName)));

    return Promise.all([
      buildFixtureScript("background"),
      buildFixtureScript("probe"),
      copyFixtureFile("manifest.json"),
      copyFixtureFile("popup.html"),
      copyFixtureFile("fixture-frame.html"),
    ]);
  };

  return Promise.all([
    rolldown({
      ...rolldownOptions,
      input: "./packages/app/index.ts",
      platform: "node",
      transform: {
        ...rolldownOptions.transform,
        target: "node24",
        define: {
          ...rolldownOptions.transform?.define,
          // zustand/middleware is a single barrel, so importing
          // subscribeWithSelector also pulls in devtools and its
          // `import.meta.env` reads, which rolldown warns about under the `cjs`
          // format. devtools is tree-shaken out, so the value never matters.
          "import.meta": "{}",
        },
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
    buildExtensionScript(
      "./packages/electron-extensions/facade/index.ts",
      "extensions-chrome-facade.js",
    ),
    buildExtensionScript(
      "./packages/electron-extensions/runtime-proxy/shim-entry.ts",
      "extensions-runtime-proxy-shim.js",
    ),
    buildExtensionScript(
      "./packages/electron-extensions/runtime-proxy/relay-entry.ts",
      "extensions-runtime-proxy-relay.js",
    ),
    buildFixtureExtension(),
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
      // Pinned to one stack: "localhost" resolves to both 127.0.0.1 and ::1,
      // and Vite's free-port probe claims only one of them, so simultaneous
      // dev servers can each believe they own the same port.
      host: "127.0.0.1",
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
