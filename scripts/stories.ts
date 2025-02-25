import path from "node:path";
import { Glob, serve } from "bun";

const storiesGlob = new Glob("**/*.stories.tsx");

const stories: Record<string, string[]> = {};

for await (const file of storiesGlob.scan()) {
	const componentStories = await import(path.resolve(process.cwd(), file));

	for (const story of Object.keys(componentStories)) {
		const filePath = path.resolve(process.cwd(), file);

		if (stories[filePath]) {
			stories[filePath].push(story);
		} else {
			stories[filePath] = [story];
		}
	}
}

await Bun.write(
	"index.html",
	`<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="./src/renderer/styles.css" />
    <script src="./app.tsx" type="module"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
);

await Bun.write(
	"app.tsx",
	`import { createRoot } from "react-dom/client";
  ${Object.entries(stories).reduce((acc, [file, stories]) => `${acc}import {${stories.join(",")}} from "${file}"\n`, "")}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = createRoot(rootElement);

root.render(
  <div>
${Object.values(stories).reduce((acc, stories) => `${stories.map((story) => `<${story} />`).join("\n")}\n`, "")}
</div>
);
  `,
);

const html = await import("../index.html");

serve({
	routes: {
		"/": html.default,
	},
});
