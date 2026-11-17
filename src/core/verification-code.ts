/**
 * The digits of the one-time code in `[subject, summary]`, as Gmail's feed
 * gives them (the summary a snippet often cut mid-sentence), separators taken
 * out, or `undefined` when there is none. Pure, with no settings; the words it
 * reads are in `verification-code.lexicon.ts`, and its behaviour is the design
 * record's, `features/verification-codes.md`.
 *
 * Set aside in slice 2.6 to be written again from that record: until then it
 * finds nothing, so every message is notified as new mail.
 */
export const extractVerificationCode = (
  texts: readonly string[]
): string | undefined => {
  void texts;

  return undefined;
};
