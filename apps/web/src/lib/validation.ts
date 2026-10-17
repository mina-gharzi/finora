import { z } from "zod";

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
  .max(72, { error: "گذرواژه بیش از حد طولانی است." })
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
    .min(1, { error: "گذرواژه را وارد کنید." }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

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
