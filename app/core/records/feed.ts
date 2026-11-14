import { z } from "zod";

const feedPersonSchema = z.object({
  email: z.string(),
  name: z.string(),
});

/** One unread message in the inbox as Gmail's Atom feed lists it. */
const feedEntrySchema = z.object({
  /** The entry's `id`, stable for the message, which tells a new message from one already seen. */
  id: z.string(),
  /** The hex id in the link's `message_id`, which Gmail's own URLs and actions take. */
  messageId: z.string(),
  subject: z.string(),
  summary: z.string(),
  link: z.string(),
  author: feedPersonSchema,
  /** When the message arrived, in milliseconds since the epoch. */
  issued: z.number(),
});

export type FeedEntry = z.infer<typeof feedEntrySchema>;

/** A profile's Gmail inbox feed: how many are unread, which may be more than the entries it lists, and the newest of them. */
const feedSchema = z.object({
  unread: z.number().int().min(0),
  entries: z.array(feedEntrySchema),
});

export type Feed = z.infer<typeof feedSchema>;
