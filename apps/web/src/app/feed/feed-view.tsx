"use client";

import { Loader2 } from "lucide-react";
import { Composer } from "@/components/feed/composer";
import { DarkModeToggle } from "@/components/feed/dark-mode-toggle";
import { Header } from "@/components/feed/header";
import { PostList } from "@/components/feed/post-list";
import { LeftSidebar } from "@/components/feed/static/left-sidebar";
import { MobileBottomNav } from "@/components/feed/static/mobile-bottom-nav";
import { RightSidebar } from "@/components/feed/static/right-sidebar";
import { Stories } from "@/components/feed/static/stories";
import { useMe } from "@/hooks/use-auth";
import { useDarkMode } from "@/hooks/use-dark-mode";

export function FeedView() {
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
                  <div className="_layout_middle_inner">
                    <Stories />
                    <Composer me={me.data} />
                    <PostList me={me.data} />
                  </div>
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
