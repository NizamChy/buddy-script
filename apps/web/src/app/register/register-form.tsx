"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AuthShell, FieldError, FormAlert } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { api, ApiError } from "@/lib/api";
import { meKey } from "@/hooks/use-auth";

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(60, `${label} is too long`)
    .regex(/^[\p{L}\p{M}' .-]+$/u, `${label} contains invalid characters`);

// Mirrors the API's rules so users get instant feedback; the API re-validates everything.
const schema = z
  .object({
    firstName: name("First name"),
    lastName: name("Last name"),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "At least 8 characters")
      .max(72, "At most 72 characters")
      .regex(/[a-z]/, "Add a lowercase letter")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/[0-9]/, "Add a number"),
    confirmPassword: z.string().min(1, "Please repeat your password"),
    terms: z.boolean().refine((v) => v, "You must accept the terms & conditions"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
type Values = z.infer<typeof schema>;

type FieldName = "firstName" | "lastName" | "email";

export function RegisterForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  const onSubmit = async ({ firstName, lastName, email, password }: Values) => {
    setFormError(null);
    try {
      const { user } = await api.register({ firstName, lastName, email, password });
      qc.setQueryData(meKey, user);
      router.replace("/feed");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) return setError("email", { message: err.message });
        // Map server-side validation errors back onto their fields.
        const fieldErr = err.details?.find((d) =>
          ["firstName", "lastName", "email", "password"].includes(d.path),
        );
        if (fieldErr) return setError(fieldErr.path as FieldName, { message: fieldErr.message });
        return setFormError(err.message);
      }
      setFormError("Unable to reach the server. Check your connection.");
    }
  };

  const input = "form-control _social_registration_input";

  return (
    <AuthShell variant="registration">
      <div className="_social_registration_content">
        <div className="_social_registration_right_logo _mar_b28">
          <img src="/images/logo.svg" alt="Buddy Script" className="_right_logo" />
        </div>
        <p className="_social_registration_content_para _mar_b8">Get Started Now</p>
        <h1 className="_social_registration_content_title _titl4 _mar_b50">Registration</h1>

        <form className="_social_registration_form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormAlert message={formError} />
          <div className="row">
            <div className="col-sm-6 col-12">
              <div className="_social_registration_form_input _mar_b14">
                <label htmlFor="firstName" className="_social_registration_label _mar_b8">
                  First name
                </label>
                <input
                  id="firstName"
                  autoComplete="given-name"
                  className={input}
                  aria-invalid={!!errors.firstName}
                  {...register("firstName")}
                />
                <FieldError id="firstName-error" message={errors.firstName?.message} />
              </div>
            </div>
            <div className="col-sm-6 col-12">
              <div className="_social_registration_form_input _mar_b14">
                <label htmlFor="lastName" className="_social_registration_label _mar_b8">
                  Last name
                </label>
                <input
                  id="lastName"
                  autoComplete="family-name"
                  className={input}
                  aria-invalid={!!errors.lastName}
                  {...register("lastName")}
                />
                <FieldError id="lastName-error" message={errors.lastName?.message} />
              </div>
            </div>
            <div className="col-12">
              <div className="_social_registration_form_input _mar_b14">
                <label htmlFor="email" className="_social_registration_label _mar_b8">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={input}
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                <FieldError id="email-error" message={errors.email?.message} />
              </div>
            </div>
            <div className="col-12">
              <div className="_social_registration_form_input _mar_b14">
                <label htmlFor="password" className="_social_registration_label _mar_b8">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  inputClassName={input}
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                <FieldError
                  id="password-error"
                  message={errors.password?.message}
                />
                {!errors.password && (
                  <p className="mt-1 mb-0 text-[12px] text-gray-500">
                    8+ characters with upper & lower case letters and a number.
                  </p>
                )}
              </div>
            </div>
            <div className="col-12">
              <div className="_social_registration_form_input _mar_b14">
                <label htmlFor="confirmPassword" className="_social_registration_label _mar_b8">
                  Repeat Password
                </label>
                <PasswordInput
                  id="confirmPassword"
                  autoComplete="new-password"
                  inputClassName={input}
                  aria-invalid={!!errors.confirmPassword}
                  {...register("confirmPassword")}
                />
                <FieldError id="confirm-error" message={errors.confirmPassword?.message} />
              </div>
            </div>
          </div>
          <div className="row">
            <div className="col-12">
              <div className="form-check _social_registration_form_check">
                <input
                  className="form-check-input _social_registration_form_check_input"
                  type="checkbox"
                  id="terms"
                  {...register("terms")}
                />
                <label className="form-check-label _social_registration_form_check_label" htmlFor="terms">
                  I agree to terms & conditions
                </label>
              </div>
              <FieldError id="terms-error" message={errors.terms?.message} />
            </div>
          </div>
          <div className="row">
            <div className="col-12">
              <div className="_social_registration_form_btn _mar_t40 _mar_b60">
                <button
                  type="submit"
                  className="_social_registration_form_btn_link _btn1 inline-flex items-center justify-center gap-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {isSubmitting ? "Creating account…" : "Register now"}
                </button>
              </div>
            </div>
          </div>
        </form>
        <div className="row">
          <div className="col-12">
            <div className="_social_registration_bottom_txt">
              <p className="_social_registration_bottom_txt_para">
                Already have an account? <Link href="/login">Log in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
