"use client";

import { useState } from "react";
import { AppShell, Tabs } from "@/components/app-shell";
import { Composer } from "@/components/feed/composer";
import { FeedPostList } from "@/components/feed/post-list";
import { Stories } from "@/components/feed/static/stories";
import type { FeedScope } from "@/lib/types";

const SCOPE_KEY = "bs.feedScope";

export function FeedView() {
  // Remember the chosen tab per browser (a convenience only). The shell renders its
  // children only on the client, after the session loads, so this can't mismatch SSR.
  const [scope, setScope] = useState<FeedScope>(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(SCOPE_KEY) === "following" ? "following" : "all";
    } catch {
      return "all";
    }
  });
  const choose = (s: FeedScope) => {
    setScope(s);
    try {
      localStorage.setItem(SCOPE_KEY, s);
    } catch {}
  };

  return (
    <AppShell>
      {(me) => (
        <>
          <Stories />
          <Composer me={me} />
          <Tabs
            label="Feed"
            value={scope}
            onChange={choose}
            options={[
              { value: "all", label: "For you" },
              { value: "following", label: "Following" },
            ]}
          />
          <FeedPostList key={scope} me={me} scope={scope} />
        </>
      )}
    </AppShell>
  );
}
