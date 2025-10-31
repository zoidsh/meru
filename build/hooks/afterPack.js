import fs from "node:fs/promises";
import path from "node:path";

export default async (context) => {
	if (process.platform === "darwin") {
		console.log("\n---------\n");
		console.log("Copying Assets.car file for macOS");

		const dirname = process.cwd();

		const appContents = await fs.readdir(context.appOutDir);

		const appName = appContents.find((item) => item.endsWith(".app"));

		if (!appName) {
			console.log(
				"No .app directory found in `context.appOutDir`, skipping Assets.car copy",
			);
			return;
		}

		const appPath = path.join(context.appOutDir, appName);

		const sourcePath = path.join(dirname, "build", "Assets.car");

		const targetPath = path.join(
			appPath,
			"Contents",
			"Resources",
			"Assets.car",
		);

		try {
			await fs.copyFile(sourcePath, targetPath);

			console.log(`Copied Assets.car to ${targetPath}`);
		} catch (error) {
			console.error(`Failed to copy Assets.car: ${error.message}`);

			throw error;
		}

		console.log("\n---------\n");
	}
};
