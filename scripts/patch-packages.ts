import path from "node:path";

await Bun.write(
	Bun.file(
		path.join(process.cwd(), "node_modules", "adblock-rs", "js", "index.node"),
	),
	Bun.file(
		path.join(process.cwd(), "patches", "adblock-rs@0.9.6", "index.node"),
	),
);
