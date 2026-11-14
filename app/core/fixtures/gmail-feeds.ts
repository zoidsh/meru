// Shaped as Gmail serves https://mail.google.com/mail/u/0/feed/atom: Atom 0.3 in the default namespace, every subject, snippet and link entity-escaped.

/** Two unread messages: one with named and numeric entities and a contributor, one whose subject and sender name are all digits. */
export const TWO_UNREAD = `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for jane@example.com</title><tagline>New messages in your Gmail Inbox</tagline><fullcount>2</fullcount><link rel="alternate" href="https://mail.google.com/mail/u/0" type="text/html" /><modified>2026-11-13T09:00:00Z</modified><entry><title>Q3 &amp; Q4 &quot;plans&quot; &#8211; Tom&#39;s draft</title><summary>Here are the &lt;numbers&gt; you asked for &#x2014; caf&#233;</summary><link rel="alternate" href="https://mail.google.com/mail/u/0?account_id=jane@example.com&amp;message_id=18c1a2b3c4d5e6f7&amp;view=conv&amp;extsrc=atom" type="text/html" /><modified>2026-11-13T08:59:00Z</modified><issued>2026-11-13T08:59:00Z</issued><id>tag:gmail.google.com,2004:1790000000000000001</id><author><name>Tom O&#39;Brien</name><email>tom@example.com</email></author><contributor><name>Ann</name><email>ann@example.com</email></contributor></entry><entry><title>2024</title><summary></summary><link rel="alternate" href="https://mail.google.com/mail/u/0?account_id=jane@example.com&amp;message_id=18c1a2b3c4d5e6f8&amp;view=conv&amp;extsrc=atom" type="text/html" /><modified>2026-11-13T08:00:00Z</modified><issued>2026-11-13T08:00:00Z</issued><id>tag:gmail.google.com,2004:1790000000000000002</id><author><name>12345</name><email>bot@example.com</email></author></entry></feed>`;

/** One unread message, which some parsers give as an object rather than a list of one. */
export const ONE_UNREAD = `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for jane@example.com</title><tagline>New messages in your Gmail Inbox</tagline><fullcount>1</fullcount><modified>2026-11-13T09:00:00Z</modified><entry><title>Lunch?</title><summary>Are you free at noon</summary><link rel="alternate" href="https://mail.google.com/mail/u/0?account_id=jane@example.com&amp;message_id=18c1a2b3c4d5e6f9&amp;view=conv&amp;extsrc=atom" type="text/html" /><modified>2026-11-13T08:30:00Z</modified><issued>2026-11-13T08:30:00Z</issued><id>tag:gmail.google.com,2004:1790000000000000003</id><author><name>Ann</name><email>ann@example.com</email></author></entry></feed>`;

/** Nothing unread. */
export const NONE_UNREAD = `<?xml version="1.0" encoding="UTF-8"?><feed version="0.3" xmlns="http://purl.org/atom/ns#"><title>Gmail - Inbox for jane@example.com</title><tagline>New messages in your Gmail Inbox</tagline><fullcount>0</fullcount><modified>2026-11-13T09:00:00Z</modified></feed>`;

/** More unread than the feed lists, which caps its entries at twenty. */
export const MORE_THAN_LISTED = NONE_UNREAD.replace(
  "<fullcount>0<",
  "<fullcount>57<"
);

/** What a signed-out session is answered with instead of the feed: Google's sign-in page. */
export const SIGN_IN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gmail</title></head><body><form action="https://accounts.google.com/v3/signin/identifier"><input name="identifier"></form></body></html>`;
