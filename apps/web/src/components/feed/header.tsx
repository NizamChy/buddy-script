"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { NotificationBell } from "@/components/notifications";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/hooks/use-auth";
import { fullName } from "@/lib/format";
import type { Me } from "@/lib/types";
import { Icons } from "./icons";

const notImplemented = () => toast.info("This section isn't part of the demo yet.");

function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [q, setQ] = useState(pathname === "/search" ? (params.get("q") ?? "") : "");
  return (
    <form
      className="_header_form_grp"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        if (!term) return;
        const tab = pathname === "/search" ? params.get("tab") : null;
        router.push(`/search?q=${encodeURIComponent(term)}${tab ? `&tab=${tab}` : ""}`);
      }}
    >
      {Icons.search}
      <input
        className="form-control me-2 _inpt1"
        type="search"
        placeholder="Search posts and people"
        aria-label="Search posts and people"
        maxLength={100}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

export function Header({ me }: { me: Me }) {
  const pathname = usePathname();
  const logout = useLogout();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close the profile dropdown on outside click / Escape.
  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProfileOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  return (
    <>
      {/* Desktop */}
      <nav className="navbar navbar-expand-lg navbar-light _header_nav _padd_t10">
        <div className="container _custom_container">
          <div className="_logo_wrap">
            <Link className="navbar-brand" href="/feed">
              <img src="/images/logo.svg" alt="Buddy Script" className="_nav_logo" />
            </Link>
          </div>
          <div className="navbar-collapse" id="navbarSupportedContent">
            <div className="_header_form ms-auto">
              <Suspense fallback={null}>
                <SearchBox />
              </Suspense>
            </div>
            <ul className="navbar-nav mb-2 mb-lg-0 _header_nav_list ms-auto _mar_r8">
              <li className="nav-item _header_nav_item">
                <Link
                  className={`nav-link _header_nav_link ${pathname === "/feed" ? "_header_nav_link_active" : ""}`}
                  aria-current={pathname === "/feed" ? "page" : undefined}
                  href="/feed"
                  aria-label="Home"
                >
                  {Icons.home}
                </Link>
              </li>
              <li className="nav-item _header_nav_item">
                <Link
                  className={`nav-link _header_nav_link ${pathname === "/search" ? "_header_nav_link_active" : ""}`}
                  href="/search?tab=people"
                  aria-label="Find people"
                >
                  {Icons.friends}
                </Link>
              </li>
              <NotificationBell icon={Icons.bell} />
              <li className="nav-item _header_nav_item">
                <button type="button" className="nav-link _header_nav_link border-0 bg-transparent" onClick={notImplemented} aria-label="Messages">
                  {Icons.chat}
                </button>
              </li>
            </ul>
            <div className="_header_nav_profile" ref={profileRef}>
              <div className="_header_nav_profile_image">
                <UserAvatar user={me} size={24} className="_nav_profile_img" />
              </div>
              <div className="_header_nav_dropdown">
                <p className="_header_nav_para">{fullName(me)}</p>
                <button
                  type="button"
                  className="_header_nav_dropdown_btn _dropdown_toggle"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  aria-label="Open profile menu"
                  onClick={() => setProfileOpen((v) => !v)}
                >
                  {Icons.caret}
                </button>
              </div>
              <div className={`_nav_profile_dropdown _profile_dropdown ${profileOpen ? "show" : ""}`} role="menu">
                <div className="_nav_profile_dropdown_info">
                  <div className="_nav_profile_dropdown_image">
                    <UserAvatar user={me} size={48} className="_nav_drop_img" />
                  </div>
                  <div className="_nav_profile_dropdown_info_txt">
                    <h4 className="_nav_dropdown_title">{fullName(me)}</h4>
                    <span className="_nav_drop_profile">{me.email}</span>
                    {me.role === "ADMIN" && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <ShieldCheck className="size-3.5" /> Admin
                      </span>
                    )}
                  </div>
                </div>
                <hr />
                <ul className="_nav_dropdown_list">
                  <li className="_nav_dropdown_list_item">
                    <button type="button" className="_nav_dropdown_link w-100 border-0 bg-transparent" onClick={notImplemented}>
                      <div className="_nav_drop_info">
                        <span>{Icons.help}</span>
                        Help &amp; Support
                      </div>
                      <span className="_nav_drop_btn_link">{Icons.chevronRight}</span>
                    </button>
                  </li>
                  <li className="_nav_dropdown_list_item">
                    <button
                      type="button"
                      role="menuitem"
                      className="_nav_dropdown_link w-100 border-0 bg-transparent"
                      onClick={() => logout.mutate()}
                      disabled={logout.isPending}
                    >
                      <div className="_nav_drop_info">
                        <span>{Icons.logout}</span>
                        {logout.isPending ? "Logging out…" : "Log Out"}
                      </div>
                      <span className="_nav_drop_btn_link">{Icons.chevronRight}</span>
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile top bar */}
      <div className="_header_mobile_menu">
        <div className="_header_mobile_menu_wrap">
          <div className="container">
            <div className="_header_mobile_menu_top_inner">
              <div className="_header_mobile_menu_logo">
                <Link href="/feed">
                  <img src="/images/logo.svg" alt="Buddy Script" className="_nav_logo" />
                </Link>
              </div>
              <div className="_header_mobile_menu_right">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger className="rounded-full border-0 bg-transparent p-0" aria-label="Account menu">
                    <UserAvatar user={me} size={34} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5 text-sm">
                      <div className="font-medium">{fullName(me)}</div>
                      <div className="text-xs font-normal text-muted-foreground">{me.email}</div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => logout.mutate()}>
                      <LogOut className="size-4" /> Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
