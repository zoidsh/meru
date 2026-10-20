import { msg } from "@lingui/core/macro";

// lingui-set comment="Option of the When to copy setting: when a detected verification code is copied to the clipboard"
export const verificationCodeCopyModes = {
  notificationClick: msg`Only when you ask`,
  immediately: msg`As soon as it arrives`,
} as const;
// lingui-reset

export type VerificationCodeCopyMode = keyof typeof verificationCodeCopyModes;
