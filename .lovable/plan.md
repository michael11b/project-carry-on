

## Plan: Full Facebook OAuth Token Exchange + Encrypted Token Storage

### Problem
Currently, a manually pasted `FACEBOOK_PAGE_ACCESS_TOKEN` secret is used for all operations. This is fragile (tokens expire), insecure (stored as plain text in secrets), and doesn't support proper per-page token management.

### Solution Overview
Build an automated setup flow where the user provides a **short-lived user token**, **App ID**, **App Secret**, and an **encryption password**. The system exchanges for long-lived tokens, fetches all page tokens, encrypts everything with AES-256-GCM, and stores them in the database. Publishing requires the encryption password to decrypt the stored token.

**Important note on encryption choice:** bcrypt is a one-way hash — it cannot decrypt. We will use **AES-256-GCM** (symmetric encryption) with a key derived from the user's password via **PBKDF2**. This allows encrypt + decrypt while keeping tokens unreadable without the password.

### Database Changes

1. **Add columns to `facebook_pages` table:**
   - `page_token_encrypted` (text) — AES-256-GCM encrypted page access token
   - `page_token_iv` (text) — initialization vector for decryption
   - `page_token_salt` (text) — PBKDF2 salt for key derivation

2. **New `facebook_credentials` table** (per org, stores the long-lived user token):
   - `id` (uuid, PK)
   - `org_id` (uuid, FK to organizations, unique)
   - `app_id_encrypted` (text)
   - `app_secret_encrypted` (text)
   - `user_token_encrypted` (text) — long-lived user token
   - `iv` (text), `salt` (text)
   - `created_at`, `updated_at`
   - RLS: only owner/admin of the org can read/write

### New Edge Function: `facebook-setup`

Accepts: `{ short_lived_token, app_id, app_secret, encryption_password, org_id }`

Steps:
1. Exchange short-lived token for long-lived user token via `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token=...`
2. Call `GET /me/accounts?access_token={long_lived_token}` to get all pages + their permanent page tokens
3. Derive encryption key from password using PBKDF2 (random salt)
4. Encrypt long-lived user token, app_id, app_secret with AES-256-GCM → store in `facebook_credentials`
5. For each page: encrypt page token with AES-256-GCM (same key, unique IV per page) → upsert into `facebook_pages`
6. Return list of page names/IDs (no tokens exposed)

### Updated Edge Function: `facebook-publish`

Change: Instead of reading `FACEBOOK_PAGE_ACCESS_TOKEN` from env, it:
1. Accepts `encryption_password` in the request body (or from a session mechanism)
2. Reads the encrypted page token from `facebook_pages` table
3. Derives key from password + stored salt via PBKDF2
4. Decrypts the page token with AES-256-GCM
5. Uses the decrypted token to publish to Facebook

### Updated Edge Function: `facebook-cron`

Since the cron runs unattended, it cannot prompt for a password. Two options:
- **Option A:** Store a server-side encryption key as a Supabase secret (`FB_ENCRYPTION_KEY`) used alongside the user password — a "dual key" approach. The cron uses the server key.
- **Option B:** Store the cron encryption password as a Supabase secret.

We will go with **Option B** (simpler): store an `FB_ENCRYPTION_PASSWORD` secret that the cron job uses to decrypt tokens. The user sets this password during setup.

### Updated Edge Function: `facebook-pages`

Change: Read page list from the `facebook_pages` DB table instead of calling the Facebook API every time.

### UI Changes: `FacebookIntegrationCard.tsx`

Replace the current "read-only status card" with a **setup form**:
1. **If not connected:** Show form with fields:
   - Short-Lived User Token (password input)
   - Facebook App ID
   - Facebook App Secret (password input)
   - Encryption Password (password input + confirm)
   - "Connect Facebook" button
2. **If connected:** Show list of pages from DB, with a "Refresh Pages" button (re-runs setup with stored credentials) and "Disconnect" button (clears all stored data)

### Security Model

- All tokens encrypted at rest with AES-256-GCM — even with DB access, tokens are unreadable without the password
- Encryption password is never stored in the database
- PBKDF2 with 100,000 iterations for key derivation
- Unique IV per encrypted value prevents pattern analysis
- RLS ensures only org owner/admin can access `facebook_credentials` and `facebook_pages`

### File Changes Summary

| File | Action |
|------|--------|
| Migration SQL | New `facebook_credentials` table, add columns to `facebook_pages`, RLS policies |
| `supabase/functions/facebook-setup/index.ts` | **Create** — token exchange + encryption + storage |
| `supabase/functions/facebook-publish/index.ts` | **Edit** — decrypt token from DB |
| `supabase/functions/facebook-cron/index.ts` | **Edit** — pass encryption password from secret |
| `supabase/functions/facebook-pages/index.ts` | **Edit** — read from DB instead of API |
| `src/components/FacebookIntegrationCard.tsx` | **Edit** — setup form with token + password fields |
| `supabase/config.toml` | Add `facebook-setup` function config |

