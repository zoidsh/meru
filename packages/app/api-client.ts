import { createMeruApiSafeClient } from "meru-api-client";

/*
 * Folded to a literal at build time, and defined whether or not the variable is
 * set. A define added only when it happens to be set leaves the expression in
 * the bundle for the environment to answer at launch, which let a shipped app be
 * pointed at any license server with one variable — and a license server that
 * answers freely is the whole of Meru Pro.
 */
const apiUrl = process.env.MERU_API_URL || undefined;

export const apiClient = createMeruApiSafeClient(apiUrl);

export const apiFallbackClient = createMeruApiSafeClient("https://api.meruapp.io/rpc");
