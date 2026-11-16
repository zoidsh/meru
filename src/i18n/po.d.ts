// Lingui's Vite plugin compiles a catalog as it is imported.
declare module "*.po" {
  import type { Messages } from "@lingui/core";

  export const messages: Messages;
}
