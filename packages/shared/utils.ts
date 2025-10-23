export function arrayMove<ValueType>(
	array: readonly ValueType[],
	fromIndex: number,
	toIndex: number,
): ValueType[] {
	const newArray = [...array];

	const startIndex = fromIndex < 0 ? array.length + fromIndex : fromIndex;

	if (startIndex >= 0 && startIndex < array.length) {
		const endIndex = toIndex < 0 ? array.length + toIndex : toIndex;

		const [item] = newArray.splice(fromIndex, 1);

		if (item) {
			newArray.splice(endIndex, 0, item);
		}
	}

	return newArray;
}

export function extractVerificationCodeFromText(text: string) {
	const hasVerificationCodeContext =
		/\b(?:code|otp|pin|verification|passcode|security)\b/i.test(text);

	if (!hasVerificationCodeContext) {
		return;
	}

	const verificationCodeMatch = text.match(/\b([A-Z0-9]{4,8})\b/i);

	return verificationCodeMatch?.[1];
}
