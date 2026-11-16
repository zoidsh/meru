interface BuildConstants {
  mode: "dev" | "prod";
  appId: string;
  productName: string;
}

/** Replaced by `scripts/build.ts`, so a production bundle holds no dev path. */
declare const MERU_BUILD: BuildConstants;

export const build: BuildConstants = MERU_BUILD;
