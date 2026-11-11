# Buddy Script

A small social feed built from the provided Login / Register / Feed HTML designs:
a **Next.js** front end, an **Express** REST API and **PostgreSQL** (via Prisma), all in TypeScript.

> **Live demo:** https://buddy-script-social.vercel.app (API: https://buddy-script-api.vercel.app/api/health) · **Demo account:** `demo@buddyscript.com` / `Demo@12345`
> (or click **"Continue with the demo account"** on the login page)

## Features

| Area | What's implemented |
| --- | --- |
| Auth | Register (first name, last name, email, password), login, logout, "remember me", demo login. JWT access token + rotating refresh token, both in `httpOnly` cookies. |
| Authorization | Protected feed (Next.js proxy redirect + API `401`), role-based access control (`USER` / `ADMIN`, e.g. `GET /api/admin/stats` is admin-only), owner checks on edit/delete. |
| Feed | Every user sees all **public** posts plus their own **private** posts, newest first, with infinite scroll (keyset pagination). |
| Posts | Text and/or image, public or "only me", edit (text + visibility), delete, copy link. "edited" marker. |
| Likes | Like / unlike posts, comments and replies with optimistic UI; "You, Radovan and 3 others" summary; dialog listing **who liked** a post/comment/reply. |
| Comments | Comments and one level of replies (like Facebook), edit/delete, like/unlike, lazy-loaded with "view more". Post owners can moderate comments on their posts. |
| UX | Pixel-faithful conversion of the supplied design (its own CSS is reused), dark mode, responsive/mobile layout, toasts, confirm dialogs, skeletons, keyboard shortcut (Ctrl+Enter to post), paste an image into the composer. |

## Architecture

```
apps/
  web/   Next.js 16 (App Router) · Tailwind 4 · shadcn/ui (Base UI) · TanStack Query · react-hook-form + zod
  api/   Express 5 · Prisma 6 · PostgreSQL · zod · sharp · Vercel Blob
design/  The original HTML/CSS/images the UI was converted from
```

The browser only ever talks to the Next.js app. `next.config.ts` rewrites `/api/*` to the Express API,
so auth cookies are **first-party** (no third-party-cookie or CORS problems, `SameSite=Lax` works) and
the API URL is never exposed to the client.

### Database design (built for a feed with millions of posts and reads)

- `users`, `sessions`, `posts`, `comments` (self-referencing `parent_id` for replies), `post_likes`, `comment_likes`. UUID keys, `timestamptz`, length-capped columns.
- **Denormalised counters** (`like_count`, `comment_count`, `reply_count`) are updated in the same transaction as the like/comment, so rendering the feed never runs `COUNT(*)`.
- **Likes use a composite primary key** `(post_id, user_id)`: one like per user is enforced by the database and like/unlike are idempotent (`PUT`/`DELETE`), so double-clicks and retries can't corrupt counters.
- **Keyset (cursor) pagination** on `(created_at, id)` everywhere instead of `OFFSET`, so page 10 000 is as fast as page 1 and new posts don't cause duplicates/skips.
- **Feed query** = `UNION ALL` of "public posts" and "my private posts", each served by its own index — `(visibility, created_at DESC, id DESC)` and `(author_id, visibility, created_at DESC, id DESC)` — then merged and limited. A single `OR` query would not be able to use either index efficiently.
- The feed is **hydrated in a constant number of queries** per page (authors, `likedByMe`, and the 3 most recent likers per post via a `LATERAL` join) — no N+1.
- Comments and replies have their own `(post_id, parent_id, created_at, id)` / `(parent_id, created_at, id)` indexes and are loaded lazily per post.
- Images are re-encoded and resized server-side, stored in object storage (Vercel Blob) with immutable cache headers, and their dimensions are stored so the UI reserves space (no layout shift).

### Security decisions

- Passwords hashed with **bcrypt** (cost 12); strong password policy validated on both client and server (zod).
- **Short-lived access JWT (15 min)** + **opaque refresh token (30 days, or session-only without "remember me")**. Only a SHA-256 hash of the refresh token is stored. Refresh tokens **rotate** on every use; reusing a rotated token revokes the whole token family (theft detection), with a short grace window for concurrent tabs.
- Tokens live in `httpOnly`, `Secure` (prod), `SameSite=Lax` cookies — unreadable by JavaScript, so XSS cannot steal them.
- **CSRF**: `SameSite=Lax` plus an `Origin`/`Referer` allow-list check on every state-changing request.
- **Rate limiting**: credential endpoints are limited per IP+email (failed attempts only); a global per-user/per-IP limiter protects the rest.
- Generic "invalid email or password" errors (no user enumeration); constant-time-ish login (a dummy hash is compared for unknown emails).
- **Private posts are invisible to others at every level**: feed, single post, likes, likers and comments return `404` (not `403`) so their existence isn't leaked.
- **Uploads**: size-limited (4 MB) in memory, then decoded and re-encoded with `sharp` — non-images are rejected whatever their MIME type, EXIF/GPS metadata is stripped and resolution capped.
- `helmet` security headers on the API; HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer and Permissions policies on the web app; API responses are `Cache-Control: private, no-store`.
- All input validated with zod; Prisma parameterises every query (the hand-written feed SQL uses tagged templates); React escapes all user content; the post-login redirect is validated to be same-site.

### Front-end decisions

- The supplied design's CSS (Bootstrap + custom) is reused inside a low-priority cascade layer so the result matches the mock-ups exactly, while new UI (dialogs, menus, toasts) uses shadcn/ui + Tailwind.
- TanStack Query caches feed/comments; likes, comments and edits update the cache **optimistically** and roll back on error.
- Images are compressed in the browser before upload (faster uploads on mobile), and the server re-encodes again as the source of truth.
- A Next.js `proxy` (formerly middleware) redirects signed-out users away from `/feed` before any HTML is sent; the API remains the real authority.

## API overview

| Method & path | Description |
| --- | --- |
| `POST /api/auth/register` · `/login` · `/refresh` · `/logout` · `GET /api/auth/me` | Authentication |
| `GET /api/posts?cursor=` · `POST /api/posts` (multipart) | Feed / create post |
| `GET` · `PATCH` · `DELETE /api/posts/:id` | Single post |
| `PUT` · `DELETE /api/posts/:id/like` · `GET /api/posts/:id/likes` | Like, unlike, who liked |
| `GET` · `POST /api/posts/:id/comments` | Top-level comments; `POST` with `parentId` creates a reply |
| `GET /api/comments/:id/replies` | Replies of a comment |
| `PATCH` · `DELETE /api/comments/:id` · `PUT` · `DELETE /api/comments/:id/like` · `GET /api/comments/:id/likes` | Comment/reply actions |
| `GET /api/admin/stats` | Admin only (RBAC) |

## Running locally

Requirements: Node 20+, Docker.

```bash
docker compose up -d                       # PostgreSQL on localhost:5434
cp apps/api/.env.example apps/api/.env     # then set JWT_ACCESS_SECRET
cp apps/web/.env.example apps/web/.env.local
npm run setup                              # install, migrate, seed demo data
npm run dev:api                            # http://localhost:4000
npm run dev:web                            # http://localhost:3000
npm test                                   # API integration tests (uses the local DB)
```

Seeded accounts: `demo@buddyscript.com` / `Demo@12345` (user) and, locally, `admin@buddyscript.com` / `Admin@12345` (admin). In production only the demo password is public; the admin password comes from `SEED_ADMIN_PASSWORD` and the other sample users get random passwords.

## Deployment

- **Web**: Vercel project with root `apps/web`, env `API_URL=<api url>`.
- **API**: Vercel project with root `apps/api` (Express zero-config, `src/index.ts` exports the app), env `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (both set by the Neon integration), `JWT_ACCESS_SECRET`, `CORS_ORIGINS=<web url>`, `BLOB_READ_WRITE_TOKEN`.
- **Database**: Neon serverless PostgreSQL; `npm run db:deploy && npm run db:seed` from `apps/api`.

## What I'd add next

Full-text search, notifications, follow graph with a fan-out-on-write timeline cache (Redis) for very large audiences, a CDN image transformer, background jobs for image processing, Playwright end-to-end tests and CI.
