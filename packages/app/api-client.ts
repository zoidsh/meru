import { createMeruApiSafeClient } from "meru-api-client";

export const apiClient = createMeruApiSafeClient(process.env.MERU_API_URL);
