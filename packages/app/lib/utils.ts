import { config } from "@/config";

export function extractVerificationCode(texts: string[]) {
  let textIncludesHighConfidenceContext = false;
  let textIncludesPositiveContext = false;

  for (const text of texts) {
    if (
      /\b(verification|sign[-\s]in|sign[-\s]up|single[-\s]use|one[-\s]time|security|authentication)\b/i.test(
        text,
      )
    ) {
      textIncludesHighConfidenceContext = true;

      break;
    }
  }

  for (const text of texts) {
    if (/\bcode\b/i.test(text)) {
      textIncludesPositiveContext = true;

      break;
    }
  }

  if (!textIncludesHighConfidenceContext || !textIncludesPositiveContext) {
    return null;
  }

  // 6-digit codes
  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{6})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1];
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{3}[\s-][0-9]{3})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{2}[\s-][0-9]{2}[\s-][0-9]{2})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  // 8-digit codes
  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{8})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1];
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{4}[\s-][0-9]{4})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(
      /\b([0-9]{2}[\s-][0-9]{2}[\s-][0-9]{2}[\s-][0-9]{2})\b/,
    );

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  // 4-digit codes
  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{4})\b/);

    if (
      verificationCodeMatch?.[1] &&
      verificationCodeMatch[1] !== new Date().getFullYear().toString()
    ) {
      return verificationCodeMatch[1];
    }
  }

  for (const text of texts) {
    const verificationCodeMatch = text.match(/\b([0-9]{2}[\s-][0-9]{2})\b/);

    if (verificationCodeMatch?.[1]) {
      return verificationCodeMatch[1].replace(/[\s-]/g, "");
    }
  }

  return null;
}

export function parseUnreadCountString(unreadCountString: string) {
  const unreadCounts = unreadCountString
    .split(":")
    .map((count) => Number(count.replace(/\D/g, "")) || 0);

  if (unreadCounts.length === 2) {
    const unreadCountPreference = config.get("gmail.unreadCountPreference");

    if (unreadCountPreference !== "default") {
      return unreadCounts[unreadCountPreference === "first-section" ? 0 : 1] || 0;
    }
  }

  return unreadCounts.reduce((total, count) => total + count, 0);
}
