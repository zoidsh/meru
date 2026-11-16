// Each is replaced by a string literal in `scripts/build.ts`. Compare
// `MERU_BUILD_MODE` where it is used, never through a variable: the bundler
// folds the literal comparison and drops a development-only branch, with
// everything only that branch imports, from a production bundle.
declare const MERU_BUILD_MODE: "dev" | "prod";
declare const MERU_APP_ID: string;
declare const MERU_PRODUCT_NAME: string;
