

## Research Findings: Vertex AI Veo Video Generation API

Based on the official Google Cloud documentation, here's how the polling should work:

### The Problem
The current code uses `fetchPredictLongRunningOperation` as the polling endpoint, but the correct endpoint name per the official Vertex AI REST API reference is **`fetchPredictOperation`**.

From the docs:
- **Start**: `POST https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{MODEL_ID}:predictLongRunning`
- **Poll**: `POST https://{LOCATION}-aiplatform.googleapis.com/v1/{operationName}:fetchPredictOperation`

The `operationName` returned looks like: `projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{MODEL_ID}/operations/{OP_ID}`

### Plan

**Fix the polling URL in `supabase/functions/generate-ai-video/index.ts`**:

Change line 137 from:
```
fetchPredictLongRunningOperation
```
to:
```
fetchPredictOperation
```

That single change should resolve the 404/400 polling errors. The rest of the flow (auth, request body, response parsing) appears correct per the docs.

