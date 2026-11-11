import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { safeNext } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return <LoginForm next={safeNext(next)} />;
}
