import { config } from "@/config";

export function extractVerificationCode(texts: string[]) {
	let textIncludesVerificationKeyword = false;
	let textIncludesCodeKeyword = false;

	for (const text of texts) {
		if (/(?:verification|sign[- ]in)\b/i.test(text)) {
			textIncludesVerificationKeyword = true;

			break;
		}
	}

	for (const text of texts) {
		if (/\bcode\b/i.test(text)) {
			textIncludesCodeKeyword = true;

			break;
		}
	}

	if (!textIncludesVerificationKeyword || !textIncludesCodeKeyword) {
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
