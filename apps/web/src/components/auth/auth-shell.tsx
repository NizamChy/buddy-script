"use client";

/* eslint-disable @next/next/no-img-element */
import { useDarkMode } from "@/hooks/use-dark-mode";

/** Decorative background + two-column layout shared by the login and registration pages. */
export function AuthShell({
  variant,
  children,
}: {
  variant: "login" | "registration";
  children: React.ReactNode;
}) {
  const { dark } = useDarkMode();
  const wrapper = variant === "login" ? "_social_login_wrapper" : "_social_registration_wrapper";
  return (
    <section className={`${wrapper} _layout_main_wrapper ${dark ? "_dark_wrapper" : ""}`}>
      <div className="_shape_one">
        <img src="/images/shape1.svg" alt="" className="_shape_img" />
        <img src="/images/dark_shape.svg" alt="" className="_dark_shape" />
      </div>
      <div className="_shape_two">
        <img src="/images/shape2.svg" alt="" className="_shape_img" />
        <img src="/images/dark_shape1.svg" alt="" className="_dark_shape _dark_shape_opacity" />
      </div>
      <div className="_shape_three">
        <img src="/images/shape3.svg" alt="" className="_shape_img" />
        <img src="/images/dark_shape2.svg" alt="" className="_dark_shape _dark_shape_opacity" />
      </div>
      <div className={variant === "login" ? "_social_login_wrap" : "_social_registration_wrap"}>
        <div className="container">
          <div className="row align-items-center">
            <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
              {variant === "login" ? (
                <div className="_social_login_left">
                  <div className="_social_login_left_image">
                    <img src="/images/login.png" alt="" className="_left_img" />
                  </div>
                </div>
              ) : (
                <div className="_social_registration_right">
                  <div className="_social_registration_right_image">
                    <img src="/images/registration.png" alt="" />
                  </div>
                  <div className="_social_registration_right_image_dark">
                    <img src="/images/registration1.png" alt="" />
                  </div>
                </div>
              )}
            </div>
            <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 mb-0 text-[13px] text-red-600">
      {message}
    </p>
  );
}

export function FormAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}
