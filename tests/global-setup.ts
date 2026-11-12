import { createRequire } from "node:module";

// Electron fetches its binary on first use. Resolving it here, before any worker starts, keeps two workers from launching while the first is still unpacking it, which on CI failed as ETXTBSY or a GPU process that could not start.
const globalSetup = () => {
  createRequire(import.meta.url)("electron");
};

export default globalSetup;
