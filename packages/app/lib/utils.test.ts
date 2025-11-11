import { describe, expect, test } from "bun:test";
import { extractVerificationCode } from "./utils";

describe("extractVerificationCode", () => {
	test("returns null when no verification context is found", () => {
		expect(extractVerificationCode(["Hello world", "Random text"])).toBeNull();
	});

	test("returns null when context exists but no code is found", () => {
		expect(
			extractVerificationCode(["verification code", "no numbers here"]),
		).toBeNull();
	});

	test("extracts 4-digit numeric code with verification context", () => {
		expect(extractVerificationCode(["Your verification code is", "1234"])).toBe(
			"1234",
		);
	});

	test("extracts 6-digit numeric code with verification context", () => {
		expect(extractVerificationCode(["verification", "123456"])).toBe("123456");
	});

	test("extracts 8-digit numeric code with verification context", () => {
		expect(extractVerificationCode(["sign-in code:", "12345678"])).toBe(
			"12345678",
		);
	});

	test("matches 'sign in' context with space", () => {
		expect(extractVerificationCode(["Your sign in code", "5678"])).toBe("5678");
	});

	test("matches 'sign-in' context with hyphen", () => {
		expect(extractVerificationCode(["sign-in verification", "9012"])).toBe(
			"9012",
		);
	});

	test("matches case-insensitive verification context", () => {
		expect(extractVerificationCode(["VERIFICATION CODE", "4321"])).toBe("4321");
	});

	test("extracts alphanumeric code when no numeric-only code exists", () => {
		expect(extractVerificationCode(["verification", "AB12CD"])).toBe("AB12CD");
	});

	test("prefers numeric code over alphanumeric code", () => {
		expect(extractVerificationCode(["verification", "AB12CD", "567890"])).toBe(
			"567890",
		);
	});

	test("extracts alphanumeric code with mixed case", () => {
		expect(extractVerificationCode(["sign-in", "A1B2C3D4"])).toBe("A1B2C3D4");
	});

	test("returns null for code shorter than 4 digits", () => {
		expect(extractVerificationCode(["verification", "123"])).toBeNull();
	});

	test("returns null for code longer than 8 digits", () => {
		expect(extractVerificationCode(["verification", "123456789"])).toBeNull();
	});

	test("extracts code from middle of text", () => {
		expect(
			extractVerificationCode(["verification", "Your code is 7890 here"]),
		).toBe("7890");
	});

	test("extracts first valid code when multiple exist", () => {
		expect(extractVerificationCode(["verification", "1234", "5678"])).toBe(
			"1234",
		);
	});

	test("requires alphanumeric code to have at least one letter", () => {
		expect(extractVerificationCode(["verification", "12345678"])).toBe(
			"12345678",
		);
	});

	test("requires alphanumeric code to have at least one number", () => {
		expect(extractVerificationCode(["verification", "ABCDEFGH"])).toBeNull();
	});

	test("handles verification context in first text entry", () => {
		expect(extractVerificationCode(["verification 1234"])).toBe("1234");
	});

	test("handles code in same text as context", () => {
		expect(extractVerificationCode(["Your verification code is 9999"])).toBe(
			"9999",
		);
	});

	test("returns null for alphanumeric code shorter than 4 characters", () => {
		expect(extractVerificationCode(["verification", "A1B"])).toBeNull();
	});

	test("returns null for alphanumeric code longer than 8 characters", () => {
		expect(extractVerificationCode(["verification", "A1B2C3D4E5"])).toBeNull();
	});

	test("extracts 5-digit numeric code", () => {
		expect(extractVerificationCode(["verification", "12345"])).toBe("12345");
	});

	test("extracts 7-digit numeric code", () => {
		expect(extractVerificationCode(["sign in", "1234567"])).toBe("1234567");
	});
});
