import { rm, watch } from "node:fs/promises";
import { parseArgs } from "node:util";
import rendererHtml from "@/renderer/index.html";
import { type Subprocess, build, file, serve, spawn } from "bun";
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

await rm("./build-js", { recursive: true, force: true });

function buildAppFiles() {
	return build({
		entrypoints: [
			"./src/app.ts",
			"./src/gmail/preload/index.ts",
			"./src/renderer/preload.ts",
		],
		outdir: "./build-js",
		target: "node",
		format: "cjs",
		external: ["electron"],
		sourcemap: "linked",
		define: !args.values.dev
			? {
					"process.env.NODE_ENV": JSON.stringify("production"),
					"process.env.MERU_API_URL": JSON.stringify(process.env.MERU_API_URL),
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
		outdir: "./build-js/renderer",
		sourcemap: "linked",
		define: {
			"process.env.NODE_ENV": JSON.stringify("production"),
		},
		plugins: [bunPluginTailwind],
	});

	const appJs = await file("./build-js/app.js");

	await appJs.write(
		await appJs.text().then((text) => text.replace(/var __dirname.*;/g, "")),
	);
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

	const watcher = watch("./src", { recursive: true });

	for await (const event of watcher) {
		if (event.filename?.includes("renderer")) {
			continue;
		}

		await buildAppFiles();

		await restartElectron();
	}
}
