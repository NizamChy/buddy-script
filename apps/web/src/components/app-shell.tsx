"use client";

import { Loader2 } from "lucide-react";
import { DarkModeToggle } from "@/components/feed/dark-mode-toggle";
import { Header } from "@/components/feed/header";
import { LeftSidebar } from "@/components/feed/static/left-sidebar";
import { MobileBottomNav } from "@/components/feed/static/mobile-bottom-nav";
import { RightSidebar } from "@/components/feed/static/right-sidebar";
import { useMe } from "@/hooks/use-auth";
import { useDarkMode } from "@/hooks/use-dark-mode";
import type { Me } from "@/lib/types";

/** The signed-in three-column layout (header, sidebars) around a page's main column. */
export function AppShell({ children }: { children: (me: Me) => React.ReactNode }) {
  const me = useMe();
  const { dark } = useDarkMode();

  if (!me.data) {
    // While the session is being validated (the API client refreshes expired tokens
    // and redirects to /login if the session is gone).
    return (
      <div className="flex min-h-screen items-center justify-center" aria-busy="true">
        {me.isError ? (
          <p className="text-sm text-gray-600">Couldn&apos;t load your session. Please refresh.</p>
        ) : (
          <Loader2 className="size-6 animate-spin text-[#1890ff]" />
        )}
      </div>
    );
  }

  return (
    <div className={`_layout _layout_main_wrapper ${dark ? "_dark_wrapper" : ""}`}>
      <DarkModeToggle />
      <div className="_main_layout">
        <Header me={me.data} />
        <MobileBottomNav />
        <div className="container _custom_container">
          <div className="_layout_inner_wrap">
            <div className="row">
              <aside className="col-xl-3 col-lg-3 col-md-12 col-sm-12" aria-label="Explore">
                <LeftSidebar />
              </aside>
              <main className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                <div className="_layout_middle_wrap">
                  <div className="_layout_middle_inner">{children(me.data)}</div>
                </div>
              </main>
              <aside className="col-xl-3 col-lg-3 col-md-12 col-sm-12" aria-label="Suggestions">
                <RightSidebar />
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Segmented tabs styled to match the design's cards. */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="bs-tabs _feed_inner_area _b_radious6 _mar_b16">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`bs-tab ${value === o.value ? "bs-tab-active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
