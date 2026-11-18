// Labelled messages v4 added to v3's corpus, in its shape, kept apart from
// v3's file so that one stays as it was carried. Each is synthetic. `expected`
// is the right answer; one marked `knownMiss` (a code not found) or
// `knownFalsePositive` (a code given where there is none) gets that answer
// wrong today, and the test asserts its `answer`, so a change that fixes or
// worsens it is loud.

import type { CorpusEntry } from "./verification-code.corpus.test-data.ts";

export interface V4CorpusEntry extends CorpusEntry {
  knownMiss?: { answer: string | null; why: string };
  knownFalsePositive?: { answer: string; why: string };
}

export const corpusV4: V4CorpusEntry[] = [
  {
    subject: "Run failed: deploy - main",
    summary: "Process completed with exit code 1. Job 48291034 on runner 4417",
    expected: null,
    language: "en",
    note: "a CI run's exit status",
  },
  {
    subject: "[acme/web] Run failed",
    summary: "Error: exit code 137 after 1840 seconds",
    expected: null,
    language: "en",
  },
  {
    subject: "Build failed: exit code 1",
    summary: "Job 482910 failed after 4 minutes",
    expected: null,
    language: "en",
  },
  {
    subject: "Your postcode",
    summary: "Postcode 10115 Berlin",
    expected: null,
    language: "en",
  },
  {
    subject: "Your PIN reset",
    summary: "Call our helpline on 0345 6789 if you did not request it",
    expected: null,
    language: "en",
    note: "a phone number grouped as a code is",
  },
  {
    subject: "This week in code",
    summary: "Learn how 4000 developers wrote better code in 2025. Read 5 tips",
    expected: null,
    language: "en",
    note: "prose counting things",
  },
  {
    subject: "Weekly code digest",
    summary: "Top story: 5000 lines of code removed from the kernel",
    expected: null,
    language: "en",
  },
  {
    subject: "Your locker code",
    summary: "Your locker code is 482910. Collect your parcel by Friday",
    expected: null,
    language: "en",
    note: "typed at a locker, not into a website",
  },
  {
    subject: "Parcel ready",
    summary: "Your locker PIN is 482910",
    expected: null,
    language: "en",
  },
  {
    subject: "Invitation: Code review",
    summary: "Dial-in: 0800 4829 PIN 482910#",
    expected: null,
    language: "en",
    note: "a meeting's dial-in PIN is typed into a phone",
  },
  {
    subject: "Weekly sync",
    summary: "Join by phone: 030 1234567, PIN 482910",
    expected: null,
    language: "en",
  },
  {
    subject: "Zoom meeting invite",
    summary: "Meeting ID: 8123 4567 Passcode: abc123",
    expected: null,
    language: "en",
  },
  {
    subject: "Your account code",
    summary: "Account number 48291034 has been updated",
    expected: null,
    language: "en",
  },
  {
    subject: "VAT code update",
    summary: "VAT number 48291034",
    expected: null,
    language: "en",
  },
  {
    subject: "OTP for card ending 4829",
    summary: "Your OTP will be sent separately",
    expected: null,
    language: "en",
  },
  {
    subject: "Boarding pass confirmation code ABC123",
    summary: "Flight 4829 departs at 10:30",
    expected: null,
    language: "en",
  },
  {
    subject: "Code: you've earned 5000 points",
    summary: "Redeem now",
    expected: null,
    language: "en",
  },
  {
    subject: "Your code saves you 25",
    summary: "Spend 1500 and use code at checkout",
    expected: null,
    language: "en",
  },
  {
    subject: "Order confirmation",
    summary: "Thanks! Your order code is 583920. We'll email when it ships.",
    expected: null,
    language: "en",
  },
  {
    subject: "Kod zamówienia",
    summary: "Kod 482910 dotyczy zamówienia",
    expected: null,
    language: "pl",
    note: "Polish puts the order after the code word",
  },
  {
    subject: "G-482910 is your Google verification code",
    summary: "",
    expected: "482910",
    language: "en",
    note: "a capital prefix written onto the code",
  },
  {
    subject: "Your Amazon OTP",
    summary: "Use 482910 to sign in. Track orders in the app",
    expected: "482910",
    language: "en",
    note: "a sign-in code in mail that also mentions tracking",
  },
];
