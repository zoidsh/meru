export const verificationCodeCopyModes = {
  notificationClick: "Only when you ask",
  immediately: "As soon as it arrives",
} as const;

export type VerificationCodeCopyMode = keyof typeof verificationCodeCopyModes;
