

## Plan: Add Schedule/Publish Option to Image Chat

### Problem
Generated images in the Image Chat have Save/Download/Variations buttons but no way to schedule or publish them to social media.

### Solution
Add a "Schedule / Publish" button to each generated image in `ImageChat.tsx`. When clicked, it opens the existing `PublishPanel` component (which already handles Facebook/Instagram publishing, scheduling, and approval workflows) in a dialog/sheet.

### Changes

**`src/components/ImageChat.tsx`**
1. Import `PublishPanel` and a `Dialog` (or `Sheet`) wrapper
2. Add state: `publishImageUrl: string | null` and `publishPromptText: string`
3. Add a "Schedule" button (with `CalendarDays` icon) next to Save/Download/Variations for each generated image
4. When clicked, set `publishImageUrl` to that image's URL and open a Dialog containing `<PublishPanel content={publishPromptText} mediaUrl={publishImageUrl} hasContent={true} defaultTitle={publishPromptText} />`
5. Same treatment for variation images in the grid
6. Close dialog resets `publishImageUrl` to null

This reuses the full PublishPanel with its Facebook/Instagram page selection, schedule date picker, immediate publish, and approval submission — no duplication needed.

