import path from "node:path";
import viteTailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import * as vite from "vite";

/**
 * Serves the renderer package on its own, without building the main process or
 * starting Electron: the playground is a browser page, and Electron is the
 * thing it exists to do without. The port is one along from `bun run dev`, so
 * the two can run side by side.
 */
const server = await vite.createServer({
  configFile: false,
  root: path.join(process.cwd(), "packages", "renderer"),
  plugins: [viteReact(), viteTailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3001,
    strictPort: true,
  },
  clearScreen: false,
});

await server.listen();

server.printUrls();

console.info("\n  Playground:  http://localhost:3001/playground/\n");
