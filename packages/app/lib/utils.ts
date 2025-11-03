export function extractVerificationCode(texts: string[]) {
	let hasVerificationCodeContext = false;

	for (const text of texts) {
		if (/(?:verification code)\b/i.test(text)) {
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
