import { describe, expect, it } from "vitest";
import {
  emailSchema,
  loginSchema,
  nameSchema,
  passwordSchema,
  registerSchema,
  toFieldErrors,
} from "@/lib/validation";

describe("emailSchema", () => {
  it("trims and lowercases a valid address", () => {
    expect(emailSchema.parse("  USER@Example.COM ")).toBe("user@example.com");
  });

  it("rejects a malformed address", () => {
    const result = emailSchema.safeParse("not-an-email");
    expect(result.success).toBe(false);
  });
});

describe("passwordSchema", () => {
  it("accepts a password with letters and digits of sufficient length", () => {
    expect(passwordSchema.parse("abcd1234")).toBe("abcd1234");
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(passwordSchema.safeParse("a1b2c3").success).toBe(false);
  });

  it("requires at least one letter", () => {
    const result = passwordSchema.safeParse("12345678");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("حرف");
    }
  });

  it("requires at least one digit", () => {
    const result = passwordSchema.safeParse("abcdefgh");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("رقم");
    }
  });
});

describe("nameSchema", () => {
  it("trims and accepts a normal name", () => {
    expect(nameSchema.parse("  علی  ")).toBe("علی");
  });

  it("rejects a single-character name", () => {
    expect(nameSchema.safeParse("ا").success).toBe(false);
  });
});

describe("registerSchema and toFieldErrors", () => {
  it("maps each invalid field to its first message", () => {
    const result = registerSchema.safeParse({
      name: "",
      email: "bad",
      password: "short",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const fieldErrors = toFieldErrors(result.error);
    expect(fieldErrors.name).toContain("نام");
    expect(fieldErrors.email).toBe("ایمیل معتبر نیست.");
    expect(fieldErrors.password).toContain("۸");
  });

  it("normalizes the email on a valid submission", () => {
    const parsed = registerSchema.parse({
      name: "کاربر",
      email: "MiXeD@Case.COM",
      password: "abcd1234",
    });
    expect(parsed.email).toBe("mixed@case.com");
  });
});

describe("loginSchema", () => {
  it("requires a non-empty password but does not enforce strength", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "" }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "x" }).success,
    ).toBe(true);
  });
});
