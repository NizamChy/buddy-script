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

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean(),
});
type Values = z.infer<typeof schema>;

export const DEMO_CREDENTIALS = { email: "demo@buddyscript.com", password: "Demo@12345" };

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: true },
  });

  const onSubmit = async (values: Values) => {
    setFormError(null);
    try {
      const { user } = await api.login(values);
      qc.setQueryData(meKey, user);
      router.replace(next);
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Unable to reach the server. Check your connection.",
      );
    }
  };

  const loginAsDemo = () => {
    setValue("email", DEMO_CREDENTIALS.email, { shouldValidate: true });
    setValue("password", DEMO_CREDENTIALS.password, { shouldValidate: true });
    void handleSubmit(onSubmit)();
  };

  return (
    <AuthShell variant="login">
      <div className="_social_login_content">
        <div className="_social_login_left_logo _mar_b28">
          <img src="/images/logo.svg" alt="Buddy Script" className="_left_logo" />
        </div>
        <p className="_social_login_content_para _mar_b8">Welcome back</p>
        <h1 className="_social_login_content_title _titl4 _mar_b50">Login to your account</h1>

        <button
          type="button"
          className="_social_login_content_btn _mar_b40"
          onClick={loginAsDemo}
          disabled={isSubmitting}
        >
          <img src="/images/Avatar.png" alt="" className="_google_img rounded-full" />{" "}
          <span>Continue with the demo account</span>
        </button>
        <div className="_social_login_content_bottom_txt _mar_b40">
          <span>Or</span>
        </div>

        <form className="_social_login_form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormAlert message={formError} />
          <div className="row">
            <div className="col-12">
              <div className="_social_login_form_input _mar_b14">
                <label htmlFor="email" className="_social_login_label _mar_b8">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="form-control _social_login_input"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...register("email")}
                />
                <FieldError id="email-error" message={errors.email?.message} />
              </div>
            </div>
            <div className="col-12">
              <div className="_social_login_form_input _mar_b14">
                <label htmlFor="password" className="_social_login_label _mar_b8">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  inputClassName="form-control _social_login_input"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  {...register("password")}
                />
                <FieldError id="password-error" message={errors.password?.message} />
              </div>
            </div>
          </div>
          <div className="row">
            <div className="col-lg-6 col-xl-6 col-md-6 col-sm-12">
              <div className="form-check _social_login_form_check">
                <input
                  className="form-check-input _social_login_form_check_input"
                  type="checkbox"
                  id="remember"
                  {...register("remember")}
                />
                <label className="form-check-label _social_login_form_check_label" htmlFor="remember">
                  Remember me
                </label>
              </div>
            </div>
            <div className="col-lg-6 col-xl-6 col-md-6 col-sm-12">
              <div className="_social_login_form_left">
                <p className="_social_login_form_left_para" title="Password reset is not part of this demo">
                  Forgot password?
                </p>
              </div>
            </div>
          </div>
          <div className="row">
            <div className="col-12">
              <div className="_social_login_form_btn _mar_t40 _mar_b60">
                <button
                  type="submit"
                  className="_social_login_form_btn_link _btn1 inline-flex items-center justify-center gap-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  {isSubmitting ? "Logging in…" : "Login now"}
                </button>
              </div>
            </div>
          </div>
        </form>
        <div className="row">
          <div className="col-12">
            <div className="_social_login_bottom_txt">
              <p className="_social_login_bottom_txt_para">
                Don&apos;t have an account? <Link href="/register">Create New Account</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
