import { z } from "zod";

/** An error as it can be written to a log or cross IPC, where an `Error` loses everything but its message. */
export const serializedErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
});

type SerializedError = z.infer<typeof serializedErrorSchema>;

/** Any thrown value as `{ name, message, stack }`; a value that is no `Error` keeps its text as the message. */
export const serializeError = (error: unknown): SerializedError => {
  if (error instanceof Error) {
    return error.stack === undefined
      ? { message: error.message, name: error.name }
      : { message: error.message, name: error.name, stack: error.stack };
  }
  return {
    message:
      typeof error === "string"
        ? error
        : (JSON.stringify(error) ?? String(error)),
    name: "NonError",
  };
};
