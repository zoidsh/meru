export const verificationCodeCopyModes = {
  notificationClick: "From the notification",
  immediately: "As soon as it arrives",
} as const;

export type VerificationCodeCopyMode = keyof typeof verificationCodeCopyModes;
