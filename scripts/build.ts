import { rm, watch } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { type Subprocess, spawn } from "bun";
import * as esbuild from "esbuild";
import * as vite from "vite";

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
				"./packages/renderer-preload/index.ts",
			],
			platform: "browser",
			target: "chrome136",
		}),
	]);
}

async function buildRenderer() {
	const viteConfig: vite.InlineConfig = {
		configFile: false,
		base: "./",
		root: path.resolve(process.cwd(), "packages", "renderer"),
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: {
				"@": path.resolve(process.cwd(), "packages", "renderer"),
			},
		},
		server: {
			port: 3000,
			strictPort: true,
		},
		build: {
			outDir: path.resolve(process.cwd(), "build-js", "renderer"),
			target: "chrome136",
		},
	};

	if (args.values.dev) {
		const viteServer = await vite.createServer(viteConfig);

		await viteServer.listen();

		viteServer.printUrls();

		return;
	}

	await vite.build(viteConfig);
}

await Promise.all([buildAppFiles(), buildRenderer()]);

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
		if (event.filename?.includes("renderer")) {
			continue;
		}

		await buildAppFiles();

		await restartElectron();
	}
}
