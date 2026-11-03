# Mobile API v1

Base path: `/api/v1/auth`. Every endpoint is a `POST` accepting JSON and
responding with `Cache-Control: no-store`. Errors are shaped as
`{ "error": "code", "message": "..." }`.

## Tokens
- **Access token** — signed JWT, valid for **15 minutes**; send it as
  `Authorization: Bearer <accessToken>`.
- **Refresh token** — opaque, valid for **30 days**, **rotated on every
  refresh**; only its hash is stored server-side.

## POST /api/v1/auth/login
Request:
```json
{ "email": "user@example.com", "password": "secret", "deviceName": "iPhone" }
```
Response:
```json
{
  "accessToken": "eyJ...",
  "accessTokenExpiresAt": "2026-01-01T00:15:00.000Z",
  "refreshToken": "opaque-token",
  "refreshTokenExpiresAt": "2026-01-31T00:00:00.000Z",
  "user": {
    "id": "uuid",
    "name": "کاربر",
    "email": "user@example.com",
    "emailVerifiedAt": null
  }
}
```
Errors: `400 bad_request`, `401 unauthorized`, `429 rate_limited`.

## POST /api/v1/auth/refresh
Request:
```json
{ "refreshToken": "opaque-token" }
```
Returns a `MobileTokenPair` (the four token fields above, without `user`). The
returned `refreshToken` is **new**; the submitted one is spent.
Errors: `400 bad_request`, `401 unauthorized` (invalid, expired, reused or
password-changed — deliberately indistinguishable), `429 rate_limited` with a
`Retry-After` header.

**On 401 from refresh → sign out.** Do not retry with the same token.
**Always replace the stored refresh token with the new one** returned by
refresh; the old token will never work again.

## POST /api/v1/auth/logout
Request:
```json
{ "refreshToken": "opaque-token" }
```
Response: `{ "ok": true }`. Revokes the whole device family. Idempotent: an
unknown or already-revoked token still returns `200`.
Errors: `400 bad_request`, `429 rate_limited` with `Retry-After`.

## POST /api/v1/auth/logout-all
Requires `Authorization: Bearer <accessToken>` and no body. Revokes every
refresh token and raises the session watermark, signing the user out on all
devices and the web. Response: `{ "ok": true }`.
Errors: `401 unauthorized`.

## Read-only endpoints
All require `Authorization: Bearer <accessToken>`; missing/invalid is
`401 { "error": "unauthorized", "message": "..." }`. Amounts are integer Toman
and dates are Gregorian `YYYY-MM-DD`.

### GET /api/v1/overview?period=this-month|prev-month|all-time
`MobileOverviewResponse` (identical to the legacy `/api/mobile/overview`):
```json
{ "period": "this-month", "rangeLabel": "...", "totals": { "income": 0, "expense": 0, "net": 0 }, "categoryBreakdown": [], "accountBalances": [], "recentTransactions": [], "hasAccounts": true, "hasTransactions": true }
```

### GET /api/v1/accounts
Every account, archived included.
```json
{ "items": [{ "id": "a1", "name": "نقدی", "type": "cash", "archived": false, "balance": 500000 }] }
```

### GET /api/v1/categories
```json
{ "items": [{ "id": "c1", "name": "خرید", "kind": "expense", "archived": false }] }
```

### GET /api/v1/transactions?type=&accountId=&from=&to=&q=&page=
Same filters/pagination as the web history page.
```json
{ "items": [{ "id": "t1", "type": "expense", "amount": 40000, "occurredOn": "2026-01-01", "note": "خرید", "accountId": "a1", "accountName": "نقدی", "categoryId": "c1", "categoryName": "خرید" }], "page": 1, "pageSize": 20, "total": 42 }
```

### GET /api/v1/budgets?month=YYYY-MM
Jalali month key; defaults to the month containing today.
```json
{ "monthStart": "2026-01-01", "monthEnd": "2026-01-30", "expenseCategories": [{ "id": "c1", "name": "خرید", "archived": false }], "budgets": [{ "id": "b1", "categoryId": "c1", "categoryName": "خرید", "categoryArchived": false, "monthStart": "2026-01-01", "limitAmount": 1000000, "progress": { "limit": 1000000, "spending": 250000, "remaining": 750000, "percent": 25, "status": "ok", "overspend": 0 } }], "hasExpenseCategories": true }
```

### GET /api/v1/transfers
The 100 most recent transfers.
```json
{ "items": [{ "id": "tr1", "fromAccountId": "a1", "fromAccountName": "نقدی", "toAccountId": "a2", "toAccountName": "بانک", "amount": 100000, "occurredOn": "2026-01-01", "note": "" }] }
```
