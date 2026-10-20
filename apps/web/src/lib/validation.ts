import { z } from "zod";

/**
 * bcrypt only uses the first 72 BYTES of its input. Persian letters take two
 * bytes in UTF-8, so the limit is enforced in bytes, not characters.
 */
export const MAX_PASSWORD_BYTES = 72;

/** Generous cap on login input so oversized payloads are rejected cheaply. */
const MAX_LOGIN_PASSWORD_LENGTH = 256;

export const nameSchema = z
  .string({ error: "نام را وارد کنید." })
  .trim()
  .min(2, { error: "نام باید حداقل ۲ نویسه باشد." })
  .max(60, { error: "نام بیش از حد طولانی است." });

export const emailSchema = z
  .string({ error: "ایمیل را وارد کنید." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "ایمیل معتبر نیست." }));

export const passwordSchema = z
  .string({ error: "گذرواژه را وارد کنید." })
  .min(8, { error: "گذرواژه باید حداقل ۸ نویسه باشد." })
  .refine((value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES, {
    error: "گذرواژه بیش از حد طولانی است.",
  })
  .regex(/[A-Za-z]/, { error: "گذرواژه باید حداقل یک حرف داشته باشد." })
  .regex(/[0-9]/, { error: "گذرواژه باید حداقل یک رقم داشته باشد." });

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "گذرواژه را وارد کنید." })
    .min(1, { error: "گذرواژه را وارد کنید." })
    .max(MAX_LOGIN_PASSWORD_LENGTH, { error: "گذرواژه بیش از حد طولانی است." }),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/**
 * Reset/verification links carry a 43-character base64url token; the cap only
 * needs to reject oversized garbage cheaply before it reaches hashing/SQL.
 */
export const authTokenFieldSchema = z
  .string({ error: "پیوند نامعتبر است." })
  .trim()
  .min(1, { error: "پیوند نامعتبر است." })
  .max(256, { error: "پیوند نامعتبر است." });

export const resetPasswordSchema = z
  .object({
    token: authTokenFieldSchema,
    password: passwordSchema,
    confirm: z
      .string({ error: "تکرار گذرواژه را وارد کنید." })
      .min(1, { error: "تکرار گذرواژه را وارد کنید." }),
  })
  .refine((value) => value.password === value.confirm, {
    error: "گذرواژه و تکرار آن یکسان نیستند.",
    path: ["confirm"],
  });

export const verifyEmailSchema = z.object({
  token: authTokenFieldSchema,
});

/**
 * Email-change request: the address format is the only shape rule here —
 * existence and "same as current" checks need the session-backed account and
 * therefore live in the action.
 */
export const changeEmailSchema = z.object({
  email: emailSchema,
});

/**
 * In-session password change: the current password must be re-proven before
 * the new one applies; `confirm` is compared against `password` only after
 * both pass the password policy, so mismatch errors never mask policy errors.
 */
export const changePasswordSchema = z
  .object({
    current: z
      .string({ error: "گذرواژه فعلی را وارد کنید." })
      .min(1, { error: "گذرواژه فعلی را وارد کنید." })
      .max(MAX_LOGIN_PASSWORD_LENGTH, {
        error: "گذرواژه بیش از حد طولانی است.",
      }),
    password: passwordSchema,
    confirm: z
      .string({ error: "تکرار گذرواژه را وارد کنید." })
      .min(1, { error: "تکرار گذرواژه را وارد کنید." }),
  })
  .refine((value) => value.password === value.confirm, {
    error: "گذرواژه و تکرار آن یکسان نیستند.",
    path: ["confirm"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

/** Flattens a Zod error into a `{ field: firstMessage }` map for form display. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const [key] = issue.path;
    if (typeof key === "string" && !(key in result)) {
      result[key] = issue.message;
    }
  }
  return result;
}