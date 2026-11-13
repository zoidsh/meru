import { createRequire } from "node:module";
import path from "node:path";

// Electron fetches its binary on first use. Resolving it here, before any worker starts, keeps two workers from launching while the first is still unpacking it, which on CI failed as ETXTBSY or a GPU process that could not start.
const globalSetup = () => {
  createRequire(path.join(import.meta.dirname, "..", "app", "package.json"))(
    "electron"
  );
};

export default globalSetup;
