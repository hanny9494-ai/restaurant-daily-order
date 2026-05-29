# AI Restaurant Content Assistant: Open Source Wheel Test Plan

## Purpose

This document defines how to test open-source or reusable tools before applying them to the prototype.

The goal is not to collect attractive tools. The goal is to prove whether a wheel helps the store-manager flow:

```text
platform + goal
  -> upload menu/photos/videos
  -> generate content package
  -> truth-safe review
  -> export/publish handoff
  -> result tracking
```

## Decision Rule

Use a wheel only if it reduces time without forcing the product into the wrong mental model.

Reject a wheel if it makes the UI feel like:

- social media scheduler
- AI prompt editor
- automation builder
- dashboard
- developer tool

## Wheel Categories

| Category | Candidate | Test now? | Likely use |
| --- | --- | --- | --- |
| UI shell | shadcn/ui | Yes | main UI components |
| Workflow diagram | React Flow | Yes | internal/product workflow map |
| Upload | UploadThing | Yes | quickest Next.js media upload |
| Upload | Uppy | Maybe | robust multi-source upload |
| Upload | FilePond | Maybe | simple elegant upload UI |
| Video rendering | Remotion | Later | generated short-video preview/export |
| Video processing | FFmpeg / ffmpeg.wasm | Later | trim/resize/extract frames |
| Publishing | Postiz | Later | publish/schedule adapter |
| Publishing | Mixpost | Later | publish/schedule adapter or UX reference |
| Publishing | TryPost | Later | API/MCP publish reference |
| Automation | n8n | Later | workflow handoff after manual flow works |
| Automation | Activepieces | Later | lighter automation layer |
| QA/observability | Promptfoo | Later | content QA regression |
| QA/observability | Langfuse | Later | generation trace + feedback |

## Test 1: shadcn/ui

### Hypothesis

shadcn/ui can provide enough UI components to build the first mobile-first prototype quickly.

### Test Scope

Build static screens with:

- card selection
- buttons
- progress indicator
- upload placeholder
- bottom sheet/dialog
- tabs for generated versions
- confirmation checklist

### Pass Criteria

- Screens feel simple on mobile.
- Components are easy to customize.
- No heavy dashboard look.
- Primary action is visually obvious.

### Fail Criteria

- The UI looks like an admin panel.
- Components force dense layouts.
- Too much visual complexity for a store manager.

### Decision

Use as default UI component base.

## Test 2: React Flow

### Hypothesis

React Flow is useful for internal product diagrams, but should not appear in the store-manager main flow.

### Test Scope

Build an internal workflow map:

```text
Restaurant Profile
→ Platform Playbook
→ Input Request
→ Asset Intake
→ Content Pack
→ Truth QA
→ Export
→ Results
```

### Pass Criteria

- Useful for team/admin understanding.
- Can show module status clearly.
- Does not need to be shown to store manager.

### Fail Criteria

- Team starts designing the consumer UI around node graphs.
- Store manager would need to understand workflow nodes.

### Decision

Use for internal/product visualization only.

## Test 3: UploadThing

### Hypothesis

UploadThing is the fastest way to add typed upload to a Next.js prototype.

### Test Scope

Upload:

- menu photo
- dish photos
- short video

Metadata to capture:

```ts
{
  jobId: string;
  taskId: string;
  assetType: 'menu' | 'dish_photo' | 'venue_photo' | 'short_video';
  uploadedBy: 'store_manager';
}
```

### Pass Criteria

- Upload from mobile works.
- Preview is immediate.
- Asset can be linked to the intake task.
- File type/size can be restricted.

### Fail Criteria

- Too much backend setup for prototype.
- Hard to attach metadata.
- Bad mobile upload behavior.

### Decision

Preferred first upload wheel.

## Test 4: Uppy

### Hypothesis

Uppy is better if multi-source upload becomes important.

### Test Scope

Test:

- local device upload
- drag/drop desktop upload
- file preview
- multiple files
- resumable upload if needed

### Pass Criteria

- Strong upload UX.
- Easy file preview.
- Supports future cloud/source plugins.

### Fail Criteria

- Too heavy for first mobile prototype.
- UI feels too technical.

### Decision

Use if UploadThing is not enough.

## Test 5: FilePond

### Hypothesis

FilePond can provide a polished simple upload widget.

### Test Scope

Test photo/video upload in intake screen.

### Pass Criteria

- Beautiful and simple.
- Good preview.
- Easy validation.

### Fail Criteria

- Harder to integrate with Next.js storage flow than UploadThing.

### Decision

Backup candidate.

## Test 6: Remotion

### Hypothesis

Remotion can turn content packages into simple short-video drafts.

### Test Scope

Generate a 9:16 video from:

- 3 uploaded dish images
- cover text
- subtitles
- simple transitions
- optional music placeholder

### Pass Criteria

- Can preview video in app.
- Can export MP4.
- Template can be parameterized by platform and goal.
- Output is good enough as a draft.

### Fail Criteria

- Licensing does not fit business stage.
- Render setup is too heavy.
- Output feels template-cheap.

### License Note

Review Remotion license before commercial use at team/company scale.

### Decision

Do after static content package prototype works.

## Test 7: FFmpeg / ffmpeg.wasm

### Hypothesis

FFmpeg can provide low-level media utilities without building a video editor.

### Test Scope

- extract first frame from video
- trim 5-second clip
- resize to platform ratio
- compress export

### Pass Criteria

- Reliable output.
- Works locally/server-side.
- Does not block UI.

### Fail Criteria

- Browser performance too slow.
- Server setup is simpler and should be used instead.

### Decision

Use as backend media utility later.

## Test 8: Postiz

### Hypothesis

Postiz can become a future publishing handoff adapter.

### Test Scope

Without forking core product:

- inspect API/publishing model
- test whether approved content package can be pushed as draft/scheduled post
- check platform support
- check license obligations

### Pass Criteria

- Can receive our exported content.
- Can schedule/publish without reshaping our product.
- License and deployment are acceptable.

### Fail Criteria

- Requires us to adopt its whole user model.
- License conflicts with intended business model.
- Platform support does not match China platforms.

### Decision

Future adapter only.

## Test 9: Mixpost

### Hypothesis

Mixpost may be useful as reference or adapter if license/API/stack fit.

### Test Scope

- inspect composer UX
- inspect media library
- inspect approval/calendar flow
- check API/export possibilities
- check MIT/Lite/Pro boundaries

### Pass Criteria

- Useful reference for publish queue.
- Can integrate without making Laravel/Vue the core stack.

### Fail Criteria

- Product split or stack creates too much friction.

### Decision

Reference first, adapter later.

## Test 10: TryPost

### Hypothesis

TryPost is useful for understanding AI social studio + scheduling architecture.

### Test Scope

- inspect brand profile
- inspect carousel generator
- inspect API/MCP model
- inspect asset library

### Pass Criteria

- Provides good patterns for future power-user mode.

### Fail Criteria

- AGPL or architecture constraints make direct reuse risky.

### Decision

Inspiration only for now.

## Test 11: n8n / Activepieces

### Hypothesis

Low-code automation can automate handoff after our manual flow is proven.

### Test Scope

Prototype:

```text
export package created
→ notify owner
→ wait for approval
→ push to scheduler / save to drive / send to WeChat group
```

### Pass Criteria

- Easy webhook integration.
- Human approval node works.
- Good for ops/admin.

### Fail Criteria

- Business logic starts living in workflow nodes.
- Debugging becomes harder than app code.

### Decision

External automation layer only.

## Test 12: Promptfoo

### Hypothesis

Promptfoo can catch repeated content/QA failures.

### Test Scope

Build eval cases:

- generated copy invents price
- generated copy says unavailable dish exists
- AI image described as real
- reference image enters final package
- alcohol wording too aggressive

### Pass Criteria

- Runs repeatably.
- Easy to add restaurant-specific cases.
- Can run in CI later.

### Fail Criteria

- Too much maintenance before generation pipeline stabilizes.

### Decision

Add when real generation prompts begin.

## Test 13: Langfuse

### Hypothesis

Langfuse can track generation traces, prompt versions, and human feedback.

### Test Scope

Log:

- restaurant profile
- platform
- goal
- selected content version
- QA warnings
- user approval/rejection

### Pass Criteria

- Helps debug why content was generated.
- Human feedback can improve future versions.

### Fail Criteria

- Too much operational overhead in prototype.

### Decision

Add after first generation flow exists.

## Wheel Application Roadmap

### Now

Use:

- shadcn/ui
- UploadThing or simple local upload

Possibly use:

- React Flow for internal visual diagrams

### After UI Prototype

Test:

- Remotion
- FFmpeg
- Promptfoo

### After Export Works

Test:

- Postiz
- Mixpost
- TryPost
- n8n / Activepieces

### After Real Usage

Test:

- Langfuse
- automatic metrics import
- platform-specific publishing APIs

## Prototype Test Script

Use one restaurant scenario:

```text
Restaurant: small bistro/bar
Platform: Xiaohongshu
Goal: promote new dish
Inputs:
  - menu photo
  - 3 rough dish photos
  - 1 optional 5-second video
Expected output:
  - 3 content versions
  - Xiaohongshu cover
  - title
  - body copy
  - image order
  - truth-safe checklist
  - export package
```

Pass if:

- user can complete flow in under 5 minutes
- no internal terminology appears
- generated package can be manually posted
- missing price or AI image issue is explained in plain language

Fail if:

- user needs a tutorial
- user asks what a prompt/campaign/QA is
- user cannot tell what to upload
- output cannot be copied/downloaded

## Final Recommendation

Do not test publishing wheels first.

Test the content creation flow first:

```text
platform
→ goal
→ upload
→ generate
→ review
→ export
```

Only after this flow is obvious to a low-digital-literacy restaurant manager should we connect scheduler/publishing tools.
