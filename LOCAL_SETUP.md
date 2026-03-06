# ContentForge — Local Development Setup Guide

## Prerequisites

- **Node.js** >= 18.x (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **npm** >= 9.x (comes with Node.js)
- **Git**

## 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd <repo-name>
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Environment Variables

Create a `.env` file in the project root with the following variables:

```env
VITE_SUPABASE_URL="https://<your-supabase-project-id>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<your-supabase-anon-key>"
VITE_SUPABASE_PROJECT_ID="<your-supabase-project-id>"
```

### Where to get these values:

If you're continuing from **Lovable Cloud**, the project is already connected to a Supabase instance. You can find these values in:

1. **Lovable editor** → Settings → Cloud → you'll see the project URL and anon key
2. **Supabase Dashboard** (if you have access) → Settings → API:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = `anon` / `public` key (safe to expose)
   - `VITE_SUPABASE_PROJECT_ID` = The project reference ID (the subdomain part of the URL)

### If starting fresh with a new Supabase project:

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Run all migrations from `supabase/migrations/` in order (SQL Editor → Run)
3. Copy the API credentials into `.env`
4. Set up the required secrets (see Section 5)

## 4. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:8080`

## 5. Supabase Secrets (for Edge Functions)

The edge functions require these secrets to be set in your Supabase project:

| Secret Name | Description | How to Set |
|------------|-------------|------------|
| `LOVABLE_API_KEY` | API key for Lovable AI Gateway (text/image/translation generation) | Auto-provisioned by Lovable Cloud. If running independently, you need a Lovable workspace API key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations (team invites) | Auto-available in Supabase. Found in Dashboard → Settings → API → `service_role` key |
| `SUPABASE_URL` | Supabase project URL | Auto-available in Supabase Edge Functions |
| `SUPABASE_ANON_KEY` | Supabase anon key | Auto-available in Supabase Edge Functions |

### Setting secrets via Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref <your-project-id>

# Set secrets
supabase secrets set LOVABLE_API_KEY=<your-key>
```

### Setting secrets via Supabase Dashboard:

Go to **Edge Functions → Secrets** and add the required values.

## 6. Edge Functions (Local Development)

Edge functions are in `supabase/functions/`. To run them locally:

```bash
# Serve all functions locally
supabase functions serve

# Or serve a specific function
supabase functions serve generate-text
```

Functions will be available at `http://localhost:54321/functions/v1/<function-name>`

To test against local functions, temporarily update the URLs in your code or use the Supabase CLI's local development setup.

## 7. Database Migrations

All migrations are in `supabase/migrations/`. To apply them to a new Supabase project:

```bash
# Via CLI (if linked)
supabase db push

# Or manually: copy each migration file's SQL and run in Supabase Dashboard → SQL Editor
```

## 8. Running Tests

```bash
# Run tests once
npm test

# Watch mode
npm run test:watch
```

## 9. Building for Production

```bash
npm run build
```

Output goes to `dist/`. Deploy the `dist/` folder to any static hosting (Vercel, Netlify, Cloudflare Pages, etc.).

## 10. Project Structure Quick Reference

```
src/pages/          → Page components (routes)
src/components/     → Reusable components
src/components/ui/  → shadcn/ui primitives
src/hooks/          → Custom React hooks
src/lib/            → Utilities (streaming, helpers)
src/integrations/   → Auto-generated Supabase client & types (DO NOT EDIT)
supabase/functions/ → Deno edge functions
supabase/migrations/→ SQL migrations (read-only history)
```

## 11. Key Dependencies

| Package | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Database, auth, edge functions, storage |
| `@tanstack/react-query` | Server state management |
| `framer-motion` | Animations |
| `lucide-react` | Icons |
| `react-router-dom` | Routing |
| `shadcn/ui` (Radix primitives) | UI components |
| `tailwindcss` | Styling |
| `zod` | Schema validation |

## 12. Important Notes

- **Never edit** `src/integrations/supabase/client.ts` or `types.ts` — these are auto-generated
- **Never edit** `supabase/config.toml` directly if using Lovable — it's managed automatically
- The `.env` file is gitignored — each developer needs their own copy
- Edge functions use Deno runtime, not Node.js
- All AI features go through the Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) — you need a `LOVABLE_API_KEY` to use it
