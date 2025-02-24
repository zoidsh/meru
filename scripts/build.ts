import { build, file, serve, spawn, type Subprocess } from "bun";
import { watch, rm } from "node:fs/promises";
import rendererHtml from "@/renderer/index.html";
import { parseArgs } from "node:util";
import bunPluginTailwind from "bun-plugin-tailwind";

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

function cleanup() {
	return Promise.all(
		["./out", "./dist"].map((dir) => rm(dir, { recursive: true, force: true })),
	);
}

function buildAppFiles() {
	build({
		entrypoints: [
			"./src/app.ts",
			"./src/gmail/preload.ts",
			"./src/renderer/preload.ts",
		],
		outdir: "./out",
		target: "node",
		format: "cjs",
		external: ["electron"],
		sourcemap: "linked",
		define: !args.values.dev
			? {
					"process.env.NODE_ENV": JSON.stringify("production"),
				}
			: undefined,
	});
}

async function buildRenderer() {
	if (args.values.dev) {
		return serve({
			static: { "/": rendererHtml },
			development: true,
			fetch: () => Response.json(null),
		});
	}

	await build({
		entrypoints: ["./src/renderer/index.html"],
		outdir: "./out/renderer",
		sourcemap: "linked",
		define: {
			"process.env.NODE_ENV": JSON.stringify("production"),
		},
		plugins: [bunPluginTailwind],
	});

	const appJs = await file("./out/app.js");

	await appJs.write(
		await appJs.text().then((text) => text.replace(/var __dirname.*;/g, "")),
	);
}

await Promise.all([cleanup(), buildAppFiles(), buildRenderer()]);

if (args.values.dev) {
	let electron: Subprocess;
	let isRestartingElectron = false;

	const startElectron = () => {
		electron = spawn(["electron", "."], {
			onExit: () => {
				if (!isRestartingElectron) {
					process.exit(0);
				}
			},
		});
	};

	const stopElectron = async () => {
		electron.kill();

		await electron.exited;
	};

	const restartElectron = async () => {
		isRestartingElectron = true;

		await stopElectron();

		await startElectron();

		isRestartingElectron = false;
	};

	await startElectron();

	const watcher = watch("./src", { recursive: true });

	for await (const event of watcher) {
		if (event.filename?.includes("renderer")) {
			continue;
		}

		await cleanup();

		await buildAppFiles();

		await restartElectron();
	}
}
