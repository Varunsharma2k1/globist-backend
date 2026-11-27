# Triptape backend — how the code maps to the HLD

The HLD ([triptape-hld.html](triptape-hld.html)) calls for a **modular monolith**:
one Node.js app, with each service as a module behind clear boundaries, plus
background workers. This codebase follows that layout. Every external
connection in the HLD is wired in already and **switches on when its env vars are set**.
Until then it falls back to a local stand-in, so anyone can clone and run it
with zero accounts.

```
npm install
cp .env.example .env      # fill only what you have
npm run dev               # API + chat sockets on :5001
npm run check:env         # which connections are live
curl localhost:5001/api/health/deps
```

## Layout

```
server/
├── src/
│   ├── config/env.js        ← the ONLY file that reads process.env
│   ├── app.js               ← builds Express (gateway middleware + module routers)
│   ├── server.js            ← HTTP + Socket.IO + workers; what runs on EC2/ECS
│   ├── infra/               ← our own data plumbing (one file per store)
│   │   ├── mongo.js           current primary store
│   │   ├── postgres.js        HLD primary (bookings/payments first)
│   │   ├── redis.js           cache-aside, counters, SET NX holds
│   │   ├── queue.js           BullMQ jobs (inline without Redis)
│   │   ├── storage.js         R2 presigned uploads / CDN URLs
│   │   ├── observability.js   Sentry + PostHog
│   │   └── logger.js
│   ├── integrations/        ← third-party APIs (one file per vendor)
│   │   razorpay · push (FCM) · sms (MSG91) · email (SES) · maps (Google)
│   ├── shared/              ← used by every module
│   │   ├── http.js            HttpError, asyncHandler
│   │   └── middleware/        auth (JWT) · requestId · rateLimit · idempotency · errorHandler
│   ├── modules/             ← one folder per HLD service (see ownership below)
│   │   └── index.js           route registry: [mountPath, router]
│   ├── workers/index.js     ← queue processors + periodic maintenance
│   └── seed/                ← demo data
├── db/postgres/migrations/  ← SQL migrations (npm run db:migrate)
├── test/                    ← node:test (npm test)
├── api/index.js             ← Vercel entry (no sockets/workers, REST only)
└── docker-compose.yml       ← optional local Mongo/Postgres/Valkey/MinIO
```

## Modules and owners

Each module can be built by a different person at the same time. Fill in the owner column.

| Module | HLD service | Mount | Store today | Owner |
|---|---|---|---|---|
| `auth` | Auth & users | `/api/auth` | Mongo | |
| `users` | Auth & users (profiles, wallet, wishlist) | `/api/users` | Mongo | |
| `feed` | Feed | `/api/feed` | Mongo + Redis cache | |
| `reels` | Reels & media (metadata, likes) | `/api/reels` | Mongo | |
| `media` | Reels & media (uploads, transcode) | `/api/media` | R2 + queue | |
| `engagement` | Engagement (views → counters) | `/api/engagement` | Redis → Mongo | |
| `search` | Search & explore | `/api/explore`, `/api/search` | Mongo, Google Places | |
| `trips` | Trips & agencies (trips, agencies, regions) | `/api/trips`, `/api/agencies`, `/api/regions` | Mongo | |
| `booking` | Booking (holds, inventory) | `/api/bookings` | Mongo → **Postgres next** | |
| `payments` | Payments (Razorpay, webhooks) | `/api/payments` | Mongo → **Postgres next** | |
| `notifications` | Notifications (push/SMS/email) | `/api/notifications` | queue | |
| `reviews` | Agency reviews (comments; verified-traveller badge from bookings) | `/api/reviews` | Mongo | |
| `places` | Live map pins (tape counts per location; geocode cache) | `/api/places` | Mongo + geocoder | |
| `chat` | Chat (not in the HLD; Socket.IO) | `/api/chat` + `/socket.io` | Mongo | |
| `health` | Ops | `/api/health` | — | |

### Rules that keep parallel work conflict-free

1. **Stay inside your module.** Routes, models and services for a feature live in `src/modules/<name>/`.
2. **Talk to other modules through their `*.service.js`**, never through their routes or private helpers. For example, `booking` calls `payments.service`, and `chat` calls `notifications.service`.
3. **Never read `process.env` outside `config/env.js`.** A new secret means adding it to `env.js` and `.env.example` in the same PR.
4. **Never call a vendor SDK directly.** Go through `integrations/` or `infra/`, which handle "not configured" and keep keys out of modules.
5. **Slow work goes on a queue**: `enqueue(QUEUES.X, name, data)`. Register its processor in `workers/index.js`.
6. **A new module** means its folder, one line in `modules/index.js`, a test in `test/`, and a row in the table above.
7. The only shared files (`app.js`, `modules/index.js`, `env.js`, `workers/index.js`) are each touched by a one-line diff, so merge conflicts stay trivial.

## Connection matrix

| Connection | Env vars | Without it (dev fallback) |
|---|---|---|
| MongoDB | `MONGO_URI` | in-memory DB, reseeded every restart |
| PostgreSQL | `DATABASE_URL` | disabled; `postgres.query` throws (money code must not silently skip) |
| Redis / Valkey | `REDIS_URL` | in-process Map; jobs run inline; single server only |
| Cloudflare R2 + CDN | `R2_*`, `CDN_BASE_URL` | files in `./uploads`, served at `/uploads` |
| Razorpay | `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | mock orders + `POST /api/payments/mock/confirm` |
| FCM push | `FIREBASE_SERVICE_ACCOUNT_*` | pushes logged |
| MSG91 SMS | `MSG91_*` | OTP logged |
| Amazon SES | `AWS_*`, `EMAIL_FROM` | email logged |
| Google Maps | `GOOGLE_MAPS_API_KEY` | `/api/search/places` returns 503 |
| Sentry / PostHog | `SENTRY_DSN`, `POSTHOG_API_KEY` | errors/events to the console |

## The HLD flows in code

**A · Watch the feed**: `GET /api/feed`. Pages are cache-aside in Redis for 60 s, then Mongo. The app should send views in batches to `POST /api/engagement/batch`; the maintenance job flushes the counters to the reels every 60 s.

**B · Upload a reel**:
1. `POST /api/media/upload-url` returns a presigned R2 PUT.
2. The app PUTs the bytes straight to that URL.
3. `POST /api/media/reels` creates the reel as `processing`.
4. The `transcode` job runs FFmpeg to produce HLS at 240/480/720p plus a thumbnail. Without FFmpeg it passes the original through. The reel is then `ready`.
5. The app polls `GET /api/media/reels/:id/status` until it is ready.

The old `POST /api/reels/upload` (multer) still works until the app moves over.

**C · Book and pay**: `POST /api/bookings` with `pay: true` and an `Idempotency-Key` header.
1. A seat hold is taken with `SET NX EX 600`.
2. The booking is created as `pending`, and a Razorpay order is made from the server-side price.
3. The app opens Checkout.
4. `POST /api/payments/webhook` (HMAC-verified) or `POST /api/payments/verify` sets the booking to `confirmed`. This step is idempotent.
5. `BookingConfirmed` is enqueued and the user gets a push.
6. Expired holds are cancelled by the maintenance job.

Without `pay: true` the legacy instant-confirm flow still runs, so the current app keeps working.

**Auth sessions** (`modules/auth/session.service.js`):
- **Access token:** a JWT carrying `{userId, sid}`, valid 15 min (`ACCESS_TOKEN_TTL_SEC`). It is HS256 with the issuer and audience checked.
- **Refresh token:** an opaque `<sessionId>.<256-bit secret>`. It is stored as a SHA-256 hash in the `sessions` collection and **rotated on every use**.
- **Expiry:** sliding 90 days (`REFRESH_TOKEN_TTL_DAYS`), with a hard cap of 1 year (`SESSION_MAX_DAYS`).
- **Reuse detection:** replaying a refresh token that was already rotated (outside a 60 s grace window) revokes the session.
- **Revoking** a session (logout, logout-all, theft) writes `auth:revoked:<sid>` to the cache, so its access tokens die immediately, and disconnects its chat sockets.
- **Routes:** `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`.
- **Rate limits:** login is limited per IP and per email.
- **App side:** tokens live only in SecureStore (`mobile/src/api/tokenStore.js`), and the API client refreshes them silently.
- **Rule:** any future password change must call `sessions.revokeAllForUser(userId, { exceptSid })`.

**Chat**: Socket.IO at `/socket.io`, with JWT in `auth.token` and per-user rooms. The Redis adapter switches on with `REDIS_URL`, so it works across many instances. Offline recipients get an FCM push.

## Running the pieces

| Command | What |
|---|---|
| `npm run dev` | API + sockets (+ jobs inline when there's no Redis) |
| `npm run worker` | separate worker process (needs `REDIS_URL`) |
| `RUN_WORKERS_IN_API=true npm start` | HLD Tier 1: API + worker on one box |
| `npm run db:migrate` | apply Postgres migrations |
| `npm test` | smoke tests |
| `docker compose up -d` | local Mongo/Postgres/Valkey/MinIO |

## Next steps (in HLD order)

1. **R2 for uploads.** Set `R2_*` and point the app's post-reel flow at `/api/media/*`.
2. **Move the API off Vercel to EC2 (Tier 1).** That gives WebSockets, workers and warm pools.
3. **Bookings and payments to Postgres.** The schema is in `db/postgres/migrations/001_init.sql` (slots, bookings, payments, ledger, outbox). Swap the booking and payments services to `infra/postgres.tx` with `UPDATE trip_slots SET seats_left = seats_left - n WHERE seats_left >= n`.
4. **Redis in production.** Shared caches, rate limits and holds, plus BullMQ workers.
5. **Outbox relay worker**, then feed fan-out and the search indexer on the `events` queue.
