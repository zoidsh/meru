import { rm, watch } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { type Subprocess, spawn } from "bun";
import * as esbuild from "esbuild";
import * as vite from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import viteTsconfigPaths from "vite-tsconfig-paths";

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

const browserTarget = "chrome136";

function buildAppFiles() {
	const config: esbuild.BuildOptions = {
		bundle: true,
		outdir: "./build-js",
		external: ["electron"],
		define: !args.values.dev
			? {
					"process.env.NODE_ENV": JSON.stringify("production"),
					"process.env.MERU_API_URL": JSON.stringify(process.env.MERU_API_URL),
				}
			: undefined,
		minify: !args.values.dev,
	};

	return Promise.all([
		esbuild.build({
			...config,
			entryPoints: ["./packages/app/index.ts"],
			platform: "node",
			target: "node22",
			loader: {
				".css": "text",
			},
		}),
		esbuild.build({
			...config,
			entryPoints: [
				"./packages/gmail-preload/index.ts",
				"./packages/google-meet-preload/index.ts",
				"./packages/renderer-preload/index.ts",
			],
			platform: "browser",
			target: browserTarget,
		}),
	]);
}

async function buildRenderer(rendererName: string, port: number) {
	const viteConfig: vite.InlineConfig = {
		configFile: false,
		root: path.resolve(process.cwd(), "packages", rendererName),
		plugins: [react(), tailwindcss(), viteSingleFile(), viteTsconfigPaths()],
		server: {
			port,
			strictPort: true,
		},
		build: {
			outDir: path.resolve(process.cwd(), "build-js", rendererName),
			target: browserTarget,
		},
		clearScreen: false,
	};

	if (args.values.dev) {
		const viteServer = await vite.createServer(viteConfig);

		await viteServer.listen();

		viteServer.printUrls();

		return;
	}

	await vite.build(viteConfig);
}

await Promise.all([
	buildAppFiles(),
	buildRenderer("renderer", 3000),
	buildRenderer("desktop-sources", 3001),
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
			["desktop-sources/", "renderer/", "renderer-lib/", "ui/"].some(
				(pathname) => event.filename?.includes(pathname),
			)
		) {
			continue;
		}

		await buildAppFiles();

		await restartElectron();
	}
}
