import { describe, expect, test } from "bun:test";
import { extractVerificationCode } from "./utils";

describe("extractVerificationCode", () => {
	test("extracts numeric code", () => {
		expect(
			extractVerificationCode([
				"Your verification code is 123456",
				"Please use this code to verify your account.",
			]),
		).toBe("123456");
	});

	test("extracts alphanumeric code", () => {
		expect(
			extractVerificationCode([
				"Your verification code is A1B2C3",
				"Please use this code to verify your account.",
			]),
		).toBe("A1B2C3");
	});

	test("ignores non-alphanumeric code", () => {
		expect(
			extractVerificationCode([
				"Your verification code is ABCDEF",
				"Please use this code to verify your account.",
			]),
		).toBe(null);
	});

	test("returns null when no code context", () => {
		expect(
			extractVerificationCode(["Hello world", "This is a random message"]),
		).toBeNull();
	});

	test("extracts code when minimum length", () => {
		expect(
			extractVerificationCode([
				"Your verification code is 1234",
				"Please enter this number",
			]),
		).toBe("1234");
	});

	test("extracts code when maximum length", () => {
		expect(
			extractVerificationCode([
				"Your verification code is 12345678",
				"Enter the code above",
			]),
		).toBe("12345678");
	});

	test("ignores codes that are too long", () => {
		expect(
			extractVerificationCode([
				"Your verification code is 123456789",
				"Please verify",
			]),
		).toBe(null);
	});

	test("ignores codes that are too short", () => {
		expect(extractVerificationCode(["Your code is 123", "Please verify"])).toBe(
			null,
		);
	});
});
