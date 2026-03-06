

# Facebook Integration — Auto-Publish from Content Calendar

## Overview

Integrate the Facebook Graph API so users can connect their Facebook account, select Pages they manage, and automatically publish posts (text, images, videos/reels) directly from the Content Calendar. Scheduled posts with `status = "scheduled"` will be auto-published at the scheduled time via a cron job.

## What You Need (Facebook Setup)

Facebook requires a **Facebook App** with a **Page Access Token** to publish to Pages. Here is what you will need to provide:

1. Go to [developers.facebook.com](https://developers.facebook.com) and create a Facebook App (type: Business)
2. Add the **Pages API** product
3. Generate a **long-lived Page Access Token** with these permissions: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, and optionally `publish_video` for reels/videos
4. You will provide this token as a secret when prompted

## Technical Plan

### 1. Database Changes

- Add columns to `scheduled_posts`:
  - `facebook_page_id` (text, nullable) — target Facebook Page ID
  - `media_url` (text, nullable) — URL of image/video to attach
  - `post_type` (text, default `'text'`) — `text`, `image`, `video`, `reel`
  - `published_fb_id` (text, nullable) — Facebook post ID after publishing
  - `publish_error` (text, nullable) — last error message if publish failed

- New table `facebook_pages`:
  - `id` (uuid, PK)
  - `org_id` (uuid, not null)
  - `page_id` (text, not null) — Facebook Page ID
  - `page_name` (text)
  - `access_token_secret_name` (text) — reference to the stored secret
  - `created_at` (timestamptz)
  - RLS: org members can read, editors+ can manage

### 2. Secrets

- Store `FACEBOOK_PAGE_ACCESS_TOKEN` as a backend secret (will prompt you to enter it)

### 3. Edge Function: `facebook-publish`

- Accepts a `post_id`, fetches the scheduled post from DB
- Uses the Facebook Graph API (`https://graph.facebook.com/v21.0/{page_id}/feed` for text/image, `/{page_id}/videos` for video/reels)
- Publishes and updates `scheduled_posts` with `published_fb_id` and sets `status = 'published'`
- Handles errors gracefully, stores in `publish_error`

### 4. Edge Function: `facebook-cron` (auto-publish)

- Triggered by a `pg_cron` job every minute
- Queries `scheduled_posts` where `status = 'scheduled'` AND `scheduled_at <= now()` AND `channel = 'facebook'` AND `published_fb_id IS NULL`
- Calls the publish logic for each matching post
- Updates status to `published` or records error

### 5. Edge Function: `facebook-pages` (list pages)

- Uses the Page Access Token to call `GET /me/accounts` and return the list of Pages the user manages
- Frontend calls this to let users pick which Page to post to

### 6. UI Changes

**Content Calendar (`ContentCalendar.tsx`):**
- Add `"facebook"` to the CHANNELS list
- When Facebook channel is selected in the create/edit dialog, show:
  - A Page selector (fetches from `facebook-pages` edge function)
  - A post type selector (Text, Image, Video, Reel)
  - A media URL field (for image/video posts)
- Add a "Publish Now" button on scheduled Facebook posts
- Show publish status (published FB ID or error) in the day detail view

**Settings Page:**
- Add a "Facebook" section under a new "Integrations" tab where users can enter/update their Page Access Token and see connected pages

### 7. Storage

- Use the existing `brand-logos` bucket or create a new `post-media` bucket for uploading images/videos that will be published to Facebook

## Implementation Order

1. Prompt for `FACEBOOK_PAGE_ACCESS_TOKEN` secret
2. Run DB migration (new columns + `facebook_pages` table)
3. Create `facebook-pages` edge function (list pages)
4. Create `facebook-publish` edge function (publish a single post)
5. Create `facebook-cron` edge function + pg_cron schedule
6. Update `ContentCalendar.tsx` with Facebook-specific UI
7. Add integrations section to Settings page

