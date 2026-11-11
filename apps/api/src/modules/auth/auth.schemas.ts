import { z } from "zod";

const name = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(60, `${label} is too long`)
    .regex(/^[\p{L}\p{M}' .-]+$/u, `${label} contains invalid characters`);

const email = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address").max(254));

export const registerSchema = z.object({
  firstName: name("First name"),
  lastName: name("Last name"),
  email,
  password: z
    .string({ error: "Password is required" })
    .min(8, "Password must be at least 8 characters")
    // bcrypt only uses the first 72 bytes.
    .max(72, "Password must be at most 72 characters")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export const loginSchema = z.object({
  email,
  password: z.string({ error: "Password is required" }).min(1, "Password is required").max(72),
  remember: z.boolean().optional().default(true),
});
