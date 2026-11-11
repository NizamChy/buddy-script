"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AppShell, Tabs } from "@/components/app-shell";
import { PostList } from "@/components/feed/post-list";
import { PersonRow, Suggestions } from "@/components/people";
import { useSearchPosts } from "@/hooks/use-feed";
import { useSearchUsers } from "@/hooks/use-social";
import type { Me } from "@/lib/types";

type Tab = "posts" | "people";
const card = "_feed_inner_area _b_radious6 _padd_t24 _padd_b24 _padd_r24 _padd_l24 _mar_b16";

function PeopleResults({ q }: { q: string }) {
  const res = useSearchUsers(q);
  if (!q) return <Suggestions />;
  if (res.isPending) {
    return (
      <div className={`${card} flex items-center justify-center gap-2 text-sm text-[#666]`}>
        <Loader2 className="size-4 animate-spin" /> Searching…
      </div>
    );
  }
  if (res.isError) return <div className={`${card} text-center text-sm text-[#666]`}>Search failed. Try again.</div>;
  const people = res.data.pages.flatMap((p) => p.items);
  return (
    <div className={card}>
      {people.length === 0 ? (
        <p className="mb-0 text-center text-sm text-[#666]">No people match “{q}”.</p>
      ) : (
        <div className="divide-y divide-[#f0f0f0]">
          {people.map((u) => (
            <PersonRow key={u.id} user={u} />
          ))}
        </div>
      )}
      {res.hasNextPage && (
        <button
          type="button"
          className="mx-auto mt-2 block text-sm text-[#1890ff] hover:underline"
          disabled={res.isFetchingNextPage}
          onClick={() => res.fetchNextPage()}
        >
          {res.isFetchingNextPage ? "Loading…" : "More people"}
        </button>
      )}
    </div>
  );
}

function PostResults({ q, me }: { q: string; me: Me }) {
  const res = useSearchPosts(q);
  if (!q) {
    return (
      <div className={`${card} text-center text-sm text-[#666]`}>
        Search public posts by words they contain — e.g. “photography” or “trip”.
      </div>
    );
  }
  return <PostList me={me} query={res} empty={`No posts match “${q}”.`} endText="End of results" />;
}

/** Keyed by the URL query so the box resets when the query changes elsewhere. */
function SearchForm({ initial, tab, onSearch }: { initial: string; tab: Tab; onSearch: (q: string) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      role="search"
      className={`${card} flex items-center gap-3`}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(draft);
      }}
    >
      <Search className="size-5 shrink-0 text-[#999]" aria-hidden="true" />
      <input
        type="search"
        className="form-control border-0 shadow-none"
        placeholder={tab === "people" ? "Search people by name" : "Search posts"}
        aria-label="Search"
        maxLength={100}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus={!initial}
      />
      <button type="submit" className="_feed_inner_text_area_btn_link shrink-0">
        Search
      </button>
    </form>
  );
}

export function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const tab: Tab = params.get("tab") === "people" ? "people" : "posts";

  const go = (next: { q?: string; tab?: Tab }) => {
    const sp = new URLSearchParams();
    const nq = (next.q ?? q).trim();
    if (nq) sp.set("q", nq);
    if ((next.tab ?? tab) === "people") sp.set("tab", "people");
    router.replace(`/search${sp.size ? `?${sp}` : ""}`);
  };

  return (
    <AppShell>
      {(me) => (
        <>
          <SearchForm key={q} initial={q} tab={tab} onSearch={(text) => go({ q: text })} />
          <Tabs
            label="Search results"
            value={tab}
            onChange={(t) => go({ tab: t })}
            options={[
              { value: "posts", label: "Posts" },
              { value: "people", label: "People" },
            ]}
          />
          {tab === "people" ? <PeopleResults q={q} /> : <PostResults q={q} me={me} />}
        </>
      )}
    </AppShell>
  );
}
