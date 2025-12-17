import { config } from "@/config";

export function extractVerificationCode(texts: string[]) {
	let hasVerificationCodeContext = false;

	for (const text of texts) {
		if (/(?:verification|sign[- ]in)\b/i.test(text)) {
			hasVerificationCodeContext = true;

			break;
		}
	}

	if (!hasVerificationCodeContext) {
		return null;
	}

	for (const text of texts) {
		const verificationCodeMatch = text.match(/\b([0-9]{4,8})\b/);

		if (verificationCodeMatch) {
			return verificationCodeMatch[1] || null;
		}
	}

	for (const text of texts) {
		const verificationCodeMatch = text.match(
			/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])([A-Z0-9]{4,8})\b/,
		);

		if (verificationCodeMatch) {
			return verificationCodeMatch[1] || null;
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
			return (
				unreadCounts[unreadCountPreference === "first-section" ? 0 : 1] || 0
			);
		}
	}

	return unreadCounts.reduce((total, count) => total + count, 0);
}
