

## Plan: Conversational Image Generation with Chat History and Variations

### Current State
The Image tab in Studio is a single-shot generate: user types a prompt, gets one image, done. No way to refine or request variations.

### What We'll Build

**1. Chat-based image generation UI** (replace current image input/output panels)
- A scrollable chat thread showing the conversation history (user messages + AI responses with images)
- Input bar at the bottom for follow-up instructions (e.g. "make it darker", "add a sunset background", "try a different angle")
- Each AI response displays the generated image inline in the chat

**2. Conversation memory**
- Maintain an in-memory array of `messages` (role: user/assistant, content: text, imageUrl?: string)
- Send the full conversation history to the edge function so the AI understands context and can edit/refine

**3. "Generate Variations" button**
- After an image is generated, show a "Generate N Variations" button
- Sends the same prompt N times in parallel (or asks AI for variations explicitly)
- Displays all variations in a grid; user can pick their favorite

**4. Image editing via conversation**
- When the user sends a follow-up, pass the previous image (base64 URL) back to the AI as a multi-modal message along with the editing instruction
- The edge function will accept an optional `conversationHistory` array with image references

### Technical Changes

**`supabase/functions/generate-image/index.ts`**
- Accept a new `messages` parameter (array of `{role, content}` where content can be text or multi-modal with image_url)
- When `messages` is provided, send the full conversation to the AI gateway instead of a single prompt
- Accept `variationCount` parameter; when > 1, append "generate a different variation" instruction

**`src/pages/Studio.tsx` — Image tab section (lines 606-736)**
- Replace the current two-panel layout with a chat-style interface:
  - Left panel: platform/brand settings (collapsed/compact)
  - Right panel: scrollable chat messages + input bar at bottom
- State: `imageChatMessages` array, each entry has `{id, role, text, imageUrl?, isLoading?}`
- On submit: add user message to chat, call edge function with full history, add AI response with image
- After image appears: show action buttons (Save, Download, Generate Variations)
- "Generate Variations" sends parallel requests and shows results in a grid within the chat

**New component: `src/components/ImageChat.tsx`**
- Chat message list component rendering user prompts and AI image responses
- Input bar with send button
- Variation grid sub-component
- Handles scroll-to-bottom on new messages

### UI Layout
```text
┌─────────────────────────────────────────────┐
│ Settings (Platform, Brand) — collapsible     │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ User: "A cat sitting on a mountain"     │ │
│ │                                         │ │
│ │ AI: [Generated Image]                   │ │
│ │     [Save] [Download] [3 Variations]    │ │
│ │                                         │ │
│ │ User: "Make it a sunset scene"          │ │
│ │                                         │ │
│ │ AI: [Edited Image]                      │ │
│ │     [Save] [Download] [3 Variations]    │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ Type refinement or new prompt...  [Send]│ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Files to Create/Modify
1. **Create** `src/components/ImageChat.tsx` — chat UI component with message list, input, variation grid
2. **Modify** `src/pages/Studio.tsx` — replace image tab content with `ImageChat` component, pass brands/platform/page context as props
3. **Modify** `supabase/functions/generate-image/index.ts` — accept `messages` array for multi-turn conversation, support `variationCount`

