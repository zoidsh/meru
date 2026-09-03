export const verificationCodeCopyModes = {
  notificationClick: "When you click the notification",
  immediately: "As soon as it arrives",
} as const;

export type VerificationCodeCopyMode = keyof typeof verificationCodeCopyModes;
