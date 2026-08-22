export const verificationCodeCopyModes = {
  immediately: "As soon as it arrives",
  notificationClick: "When you click the notification",
} as const;

export type VerificationCodeCopyMode = keyof typeof verificationCodeCopyModes;
