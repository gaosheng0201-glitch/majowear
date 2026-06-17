# Changelog - AI Personal Fashion Studio MVP

All notable changes and implementations for the AI Personal Fashion Studio project are documented in this file.

## [1.6.3] - 2026-06-17

### Added
- **Frontend Asset De-selection (Togglable Deselect)**
  - Implements click-to-deactivate toggle interactions for Style DNAs and Fabric Cards in `AssetSidebar.tsx`. Clicking on the currently active card toggles its state back to `null` (deactivated), accompanied by immediate UI checkbox/Check status synchronization.
  - Implements click-to-deactivate toggle interactions for Garment Cards (both root garments and variants) in `AssetSidebar.tsx`. Clicking on the active garment card toggles `activeGarment` back to `null` (unselected), resetting the canvas to its clean ready-to-design checklist state.
  - Implements identical click-to-deactivate toggles for Fabric, DNA, and Garment cards/buttons inside the chat history bubble panels, message inline Pills, and card view buttons in `AgentChat.tsx`.

### Fixed
- **Double Card Database Insertion (Idempotency Protection)**
  - Integrates state reuse verification checks in `create_fabric_card` and `create_style_dna` tool handlers in the backend `route.ts`.
  - Reuses the existing `createdFabricCard` or `createdStyleDna` generated in the pre-generation pipeline Stage 1.5, skipping duplicate database `INSERT` commands if the card was already created by the sub-agent.
  - Guarantees that exactly one card is added to the project libraries for any generation workflow path, while preserving the main agent's full ability to call creation tools during non-conflicting direct prompts.
- **Legacy Chat Input Editor Lock**
  - Removes the obsolete restriction that locked/disabled the chat editor input box (`contentEditable={false}`) and disabled the send button when no active Style DNA or Fabric Card was selected.
  - The input editor is now always editable, allowing users to send initial prompts directly to trigger conflict cards or dynamically create materials on-the-fly.

## [1.6.2] - 2026-06-17

### Added
- **Client UUID Synchronization**
  - Generates client-side message UUIDs via `crypto.randomUUID()` in both `handleSendPrompt` and `handleSelectConflictOption` to replace temporary local timestamps.
  - Passes `agentMessageId` payload to backend generate API, forcing the database row insertion to use the same UUID.
  - Ensures perfect alignment of client-side message IDs with database IDs, allowing conflict cards to successfully update their `resolved` status in Supabase.
- **Dynamic Derived Data (Render-Time Lookup)**
  - Removes `garmentCards`, `styleDnas`, and `fabricCards` from the loading history `useEffect` dependency array in `AgentChat.tsx`.
  - Refactors the JSX message rendering loop to perform dynamic, reactively updated lookups of cards by ID from the Zustand store.
  - Completely resolves the database reload loop that was wiping active streaming messages, ensuring smooth and continuous collaboration between the main agent and sub-agents.

### Changed
- **Designer Conflict Question Character Limit**
  - Adjusts character limit constraint from 25 to 50 characters in `route.ts` to allow more natural and expressive descriptions of suitability trade-offs.

### Fixed
- **Double Card Rendering in Streaming Bubble**
  - Adds `!msg.loading` condition to the top-level card container in the agent message render block. This ensures that created fabric/style cards are only rendered inside the dedicated sub-agent loading panel during the streaming process, preventing cards from showing up twice inside the bubble.
- **Zustand Store Deduplication on Asset Creation**
  - Deduplicates incoming cards in `addFabricCard`, `addStyleDna`, and `addGarmentCard` store actions. Prevents cards from appearing twice in the sidebar and workspace libraries when they are added both during stream chunk arrival and stream resolution.

## [1.6.1] - 2026-06-17

### Added
- **Conflict Prompt Reversion & Designer Persona**
  - **Designer Tone Questions**: Restores natural, professional, and concise (under 25 characters) designer-perspective questions inside `detectAndResolveConflict` to point out suitability conflicts or trade-offs.
  - **Generalization of Instruction Prompt**: Completely removes specific hardcoded examples (such as references to wetsuits or wool) from the backend NLP instruction rules, preventing model bias and enhancing general suitability evaluation.
  - **Dynamic Multi-option Generation**: Employs dynamic 3-5 options based on context, supporting UUIDs of existing cards, optional new concept recommendations (`custom_<concept_slug>`), and a universal manual input option.
- **Card-level Inline Custom Input Flow**
  - **Inline Expansion Form**: Replaces the old behavior of focusing the bottom chat editor with an inline text input form directly inside the unresolved conflict card.
  - **Immediate Resolve & Gray-out**: Clicking confirm on the inline input immediately marks the card as `resolved: true` in the DB and local state, setting `selectedOptionLabel` to the custom text (e.g. "自定义面料: 重磅真丝"). This prevents duplicate clicks and keeps chat history clean.
  - **Automated Assistant Agent Trigger**: Bypasses the conflict interceptor (`conflictResolved: true`) and resubmits the request using the custom parameter (e.g., `custom_重磅真丝`), seamlessly triggering the Assistant Agent specs generation and database saving pipeline.

## [1.6.0] - 2026-06-17

### Added
- **Sub-agent (助手 Agent) Dynamic Asset Pre-generation Pipeline**
  - **Specs Generation (Gemini 3.5-Flash with JSON Schema)**: Adds `generateFabricCardSpecs` and `generateStyleDnaSpecs` helper functions in the backend (`route.ts`) to dynamically define physical specifications for new materials (composition, weight, texture) and styles.
  - **Fail-fast Database Sync**: Intercepts custom concept parameters (e.g. `custom_neoprene`), creates new card records under the active project with correct user and project associations, and returns the newly generated real UUIDs to the main generation loop. Rejects silent fallbacks, throwing clear errors on failure to preserve data consistency.
  - **Immediate Local Asset Streaming**: Streams created fabric and style cards immediately as `created_fabric`/`created_style` chunks through the ReadableStream, before the main garment is fully generated.
- **Double Collaborating Status Transparency UX**
  - **Design Agent & Assistant Agent (助手 Agent) Split**: Shows explicit collaborative roles in the chat view. While the Assistant Agent is running, the Design Agent shows: `正在等待助手 Agent 创建面料...`.
  - **Collaborating Badge (SVG only)**: Renders a dedicated collaborating state card under the main status line using a spinning SVG icon (Lucide `<Sparkles />` component), strictly avoiding unicode emojis like `⚡` to preserve workspace aesthetics.
  - **Skeleton-to-Card Transition**: Reuses native fabric/style skeletons during sub-agent generation, which instantly morph into actual fully-functional, highlighted workspace cards as soon as the chunk data is received.
  - **Parallel Stream Parsing**: Refactors `readStream` and stream outcome hooks in `AgentChat.tsx` to concurrently parse, update stores, and highlight newly added assets together with the main garment card.

## [1.5.0] - 2026-06-17

### Added
- **Goal-Oriented Parameter Conflict Resolution & Decision Feedback Loop**
  - **Backend Conflict Interceptor Middleware (`route.ts`)**: Integrates a deterministic interceptor after loading active constraints but before creating generation tasks. If a conflict between user prompt instructions and sidebar states is found, the system performs an early abort and returns a dynamic conflict resolution payload.
  - **Gemini 3.5-Flash NLP Segmentation & Entity Matcher**: Analyzes semantic fabric and style DNA references within the user prompt, comparing them against the full candidate preset list of the project.
  - **Silent Auto-Matching (Anti-Fatigue Guard)**: If the user explicitly names a card with high certainty (95%+), the system automatically updates the parameter variables and bypasses the card popup, silently proceeding with generation.
  - **Interactive Frontend Decision Cards (`AgentChat.tsx`)**: Renders custom dynamic cards with frosted-glass single-choice button rows for unresolved conflicts. Clicking an option updates the global Zustand store (`activeFabricCardId` / `activeStyleDnaId`) to trigger immediate sidebar checkbox synchronizations.
  - **Duplicate Message Prevention**: Skips inserting user message logs into `chat_messages` during auto-resubmission requests (carrying `conflictResolved: true`) to avoid message duplicates.
  - **Persistent Card Resolution State**: Updates the database `grounding_metadata` to mark resolved cards as `resolved: true`. Loads and displays resolved historical card states as disabled, green-check-marked read-only fields ("已选用: XXX"), preventing duplicate clicks.
  - **Store Active Garment State Linkage (`store.ts`)**: Extends `setActiveGarment` store action to automatically update active fabric card and style DNA IDs to align sidebar checkboxes whenever a garment is selected.

## [1.4.0] - 2026-06-17

### Added
- **Multi-View Image Generation Pipeline (21:9 & 4:1)**
  - **Cohesive Front, Back, and Side Views**: Shifted the image generation aspect ratio in `route.ts` from `'1:1'` to `'21:9'` (for 2-view white background flat lays) and `'4:1'` (for 3-view on-body models). Instructs the Gemini image generation model to render cohesive, side-by-side splits, solving the front-back styling inconsistency.
  - **Preserving Generation Layout**: Saves the `displayMode` of the generation task inside the database `garment_cards.schema.displayMode` JSONB column. This ensures that historical or legacy 1:1 designs are displayed normally, while multi-view designs are handled dynamically.
- **Frontend Sliding Cropping Viewport**
  - **1:1 CSS Viewport Cropping**: Upgraded `GarmentCanvas.tsx` to wrap the image in a square aspect-ratio container with overflow hidden. It adjusts the image size dynamically (`233.333%` of the parent for 2-view, `400%` for 3-view), and applies exact CSS `translateX` offsets (`-3.57%` / `-53.57%` for 2-view; `-12.5%` / `-37.5%` / `-62.5%` for 3-view) to crop and center the viewport on each view seamlessly with custom sliding animations.
  - **Interactive Angle Selector Toolbar**: Adds a floating, frosted glass pill button group ("正面", "侧面", "反面") at the bottom-left of the canvas, which is only rendered for multi-view garments.
  - **Angle Synchronization in A/B Comparisons**: Upgraded `GarmentCompare.tsx` to include the same `activeAngle` state and button group. Both version A and version B images are automatically cropped and shifted to the selected angle in split screen and overlay modes, allowing users to compare the exact same angle between versions.

## [1.3.0] - 2026-06-16

### Added
- **Gemini API Conversational Image Editing**
  - **Immediate Predecessor Versioning**: Integrates step-by-step visual editing. The generator retrieves the image of the immediate predecessor garment version (`parentVersionId` or explicitly @-mentioned `args.parent_id`) and passes it as a reference part, enabling the model to carry over accumulated design changes (collar, pocket additions) across iterations.
  - **Loud Error Reporting & Proxy Diagnostics**: Replaced silent error fallback with descriptive exception throwing. If a parent image fails to download (due to local proxy blocking localhost loopback, Supabase storage access, or network issues), the backend fails loudly and provides clear instructions on debugging local proxy/loopback configurations.
  - **Ghost Card Skeleton & Status Transparency**: Streams predecessor garment details (title and image URL) during local inpainting edits (`garment_edit:<Title>:<ImageUrl>`). The frontend parses this to render a custom shimmering skeleton containing a faded grayscale preview of the parent garment with an active spinner, making the editing state visually transparent.
- **Sketch-to-Image (Hand-drawn Refinements)**
  - **Multimodal Generation**: Merged user-uploaded hand-drawn sketch assets from chat messages into the image generation pipeline, allowing Gemini to refine rough outlines into polished flat lays.

## [1.2.0] - 2026-06-16

### Added
- **AI Streaming Response & Skeletons**
  - **Dynamic State Stream (`POST /api/agent/generate`)**: Enabled real-time JSON stream output of the agent execution steps (understanding -> thinking/searching -> rendering -> saving) using Next.js `ReadableStream` response.
  - **High-Fidelity Shimmering Skeletons**: Designed custom shimmering loading placeholders in `AgentChat.tsx` representing garment cards, fabric cards, and Style DNA cards. Displays appropriate card skeleton when the backend is rendering and smoothly replaces it with real cards upon completion.
  - **Markdown & Mention Parser**: Integrated structured Markdown rendering using rich element mapping. Automatically renders headings, lists, bold text, and seamlessly embeds clickable `@款式` tags within the flow of markdown text.
- **Dual-Model Tiered Routing**
  - Upgraded semantic intent classifier to route strong reasoning/analytical prompts containing keywords like "思考" or "对比" to `gemini-3.1-pro-preview` with native `thinkingConfig` (thinking level `HIGH`), while routing regular tool calls to `gemini-3.5-flash`.

### Changed
- **Header UI Simplification**: Removed the Layout Switcher and Image Gen Model Switcher dropdown dropdown select menus from the project workspace header. Maintained Zustand store state bindings for backward payload compatibility and future settings page integration.
- **Image Generation Prompt Modernization**: Updated prompt suffixes for flat lay (`white_background`) and model (`on_body`) modes in `route.ts`. Swapped legacy keyword stuffing (`8k`, `photorealistic`) with clean, descriptive natural language descriptors optimized for Gemini 3.1 Flash Image (Nano Banana 2).

## [1.1.0] - 2026-06-16

### Added
- **Advanced Semantic Agent Upgrade**
  - **Conversational Memory & DB Persistence**: Created database table `chat_messages` with Row Level Security (RLS) policies. Saves user and agent messages with support for attachment arrays, grounding footnotes, and garment card references. Dynamically restores multi-turn chat history on workspace load.
  - **Function Calling & Intent Routing**: Registered `googleSearch`, `generate_garment_design`, `create_style_dna`, and `create_fabric_card` tools on Gemini 2.5 Pro. Agent automatically answers queries via text, generates clothing layouts, or extracts and creates database presets (automatically updating and highlighting them in the sidebar).
  - **Multimodal Chat Uploads**: Added paperclip file uploader next to chat input. Supports local image uploads, interactive thumbnail previews, and sends files as base64 inline parts to Gemini for visual fashion coordination.
  - **Google Grounding Citations**: Displays clickable superscript footnotes and details referenced web sources at the bottom of the chat bubble.
- **Asset Creation Previews & Validation Limits**
  - **Style DNA Preview Grid & 10-Image Limit**: Added a thumbnail preview grid to the Style DNA modal, showing selected files with a hover close button to remove them. Enforced a hard limit of 10 reference images (automatically slices files and warns user).
  - **Fabric Swatch Preview**: Added a close-up preview container for the single selected fabric swatch with remove capabilities.
- **Two-Step Intent Routing & Classification**
  - Implemented an intent classification pipeline in `/api/agent/generate` using `gemini-3.5-flash` to identify whether the user prompt requests a tool call (`TOOL`) or a general search query (`SEARCH`). This routes the request to `gemini-2.5-pro` with *either* custom functions or Google Search grounding, resolving the Gemini API conflict where both tools cannot be combined.
- **Google Gemini Model Upgrades**: Integrated `gemini-3.5-flash` as the core model for intent classification, visual style DNA analysis, and visual fabric swatch analysis, replacing older flash model versions.
- **Improved Dev Experience & Warning Suppression**
  - Replaced `console.error` with `console.warn` on caught agent fetch failures to suppress the intrusive Next.js dev error red screen overlay.
  - Setup undici global ProxyAgent dispatcher in `gemini.ts` to automatically route Gemini API requests through the proxy when `HTTP_PROXY` / `HTTPS_PROXY` are defined in `.env.local`.
- **Self-Healing Session Handling**
  - Added session self-healing in [page.tsx](file:///d:/majowear/src/app/page.tsx) catch block: when database query fails due to authentication/reset issues, automatically clears the invalid browser session via `signOut()` and redirects to `/login`.
- **Style DNA & Fabric Cards User-Level Scope (Global Presets)**
  - Re-scoped database queries from `project_id` to `user_id` in workspace page. User-created style DNAs and fabric cards are now shared globally across all user projects.
- **Manual Parameter Editors**
  - **Style DNA Editor**: Integrated full-featured modal dialog to review and edit name, keywords, colors, silhouettes, materials, details, and avoids.
  - **Fabric Swatch Editor**: Integrated modal dialog to review and edit composition, weight GSM, texture, drape, stretch, sheen, transparency, and optimized生图 prompt texture descriptions.
  - Both editors update Postgres and local Zustand stores reactively.
- **Prompt Input @-Mentions (ContentEditable Inline Editor & Semantic Integration)**: Upgraded the chat input to a unified `contenteditable` editor, allowing high-visibility garment Pill Tags to sit exactly inline inside the text sentence (rather than stacked at the top). The editor supports auto-expanding height (up to 5 lines before scrolling), Shift+Enter for new lines, and Enter to submit. Standard Backspace deletes the entire inline Pill atomically. The backend queries and maps all inline `@款式` elements semantically to their detailed specs, producing side-by-side Markdown comparison tables and professional fashion studio analyses.
- **Table-Level Privileges for Authenticated Users**: Included global table-level grant privileges (`GRANT ALL ON ALL TABLES...`) in migrations to prevent database permission denied errors from triggering forced session logouts for newly registered users.
- **Interactive @-Mention Pills in Chat History**: Matches and replaces plain-text `@款式` mentions inside both user and agent message bubbles with styled, hoverable Pill buttons. Clicking a Pill immediately switches the active workspace selection to that garment, enabling rapid visual navigation.
- **Agent Generation Summary Cards**: Replaced long AI-generated text descriptions of newly created garment cards, fabric cards, and Style DNAs in the chat logs with compact, card-based summaries. Shows thumbnails, categories, and success tags. Cards are fully interactive, and clicking them navigates the user's workspace to focus on the created asset. Preserved full text rationales and specifications in the database (`chat_messages.text` and `grounding_metadata`) to maintain the agent's long-term memory.


### Changed
- **Authentication & Login Redirection**: Refactored the login server action to return `{ success: true }` and handle redirection client-side with Next.js client router, preventing `NEXT_REDIRECT` errors from being caught and swallowed in client-side try-catch blocks.

### Fixed
- **Stale Closure Wiping Chat Messages**: Fixed a React stale closure bug in `AgentChat.tsx` where setting the chat messages after API response/error used the stale component state reference. This caused successfully loaded messages and error notifications to be completely wiped out (disappearing from the UI with no message or error feedback).
- **Agent-Generated Variants Lacking Lineage Link**: Fixed a bug where `parentVersionId` and active garment contexts were not passed to `/api/agent/generate`. Additionally integrated an `is_new_design` parameter into the agent's function calling metadata and intent guidelines. The agent now dynamically decides whether to create a linked variant (`is_new_design = false` and `parent_version_id` is set) or design a brand new product from scratch (`is_new_design = true` and `parent_version_id = null`), even if a garment is active.
- **Selection & Focus Loss on @-Mention Insertion**: Fixed a browser focus/selection loss bug where clicking on the popover list cleared the editor's caret position. Implemented a React-ref-based `savedRangeRef` selection cache and `onMouseDown` preventDefault bindings.
- **Stray `@` and Query Characters on Mention Select**: Resolved split text node and element selection boundary cases by implementing a DOM-boundary-agnostic backward range scanner (`deleteTriggerAndQuery` helper). This cleanly removes the trigger `@` and query text before inserting the Pill.

### Removed
- **Pre-seeded User Accounts**: Fully removed pre-seeded user credentials from database schema seeds (`seed.sql`), allowing users to register their own accounts manually and log in successfully without state/ID collisions.


## [1.0.0] - 2026-06-15

### Added
- **Local Database Environment (Supabase)**
  - Integrated Supabase local development via Docker.
  - Setup core database schema including tables: `projects`, `style_dnas`, `fabric_cards`, `garment_cards`, `collections`, and `generation_tasks`.
  - Configured Row Level Security (RLS) policies and `design_assets` storage bucket.
  - Resolved `projects` and other tables' access permission errors for `authenticated` and `anon` database roles.

- **Authentication & Security**
  - Created Login and Signup interface at `/login` powered by Supabase Auth (`@supabase/ssr`).
  - Added secure login/signup actions using Next.js Server Actions.

- **State Management & Zustand Store**
  - Added a global Zustand store in `src/lib/store.ts` to coordinate selected projects, active Style DNAs, fabric libraries, and canvas garment lists.

- **Frontend User Interface**
  - **Dynamic Dashboard (`/page.tsx`)**: Displays all projects fetched from Supabase and features a "Create New Project" modal with randomized color gradients.
  - **Project Workspace (`/projects/[id]/page.tsx`)**:
    - Left Sidebar: Interactive lists displaying active indicators for Style DNA and Fabrics, plus modals for importing new styles and fabric swatches.
    - Center Canvas: Comprehensive Spec Sheet rendering garment parameters (fit, collar, sleeves, pockets, closures, details), AI design rationales, and generating/loading previews.
    - Right Sidebar (Design Agent Chat): Full-featured conversational layout. Shows design steps, loading indicators, and links to load newly rendered garments.
  - **Bilingual Support (PRD Requirement)**: Integrated a global language toggle (ZH/EN) in the header and created a centralized translation dictionary (`src/lib/translations.ts`) to localize the entire application flow dynamically.

- **AI Pipeline Integration**
  - **Style DNA Analyzer (`POST /api/analyze-style`)**: Visual parsing of moodboards using Gemini 3.5 Flash.
  - **Fabric Swatches Analyzer (`POST /api/analyze-fabric`)**: Visually extracts fabric textures, drape, sheen, and density using Gemini 3.5 Flash.
  - **Fashion Design Agent (`POST /api/agent/generate`)**: Combines prompt and context using Gemini 3.1 Pro to output structured design specs and calls Google GenAI SDK image generation (`models.generateContent` with `responseModalities: ["IMAGE"]` using `gemini-3.1-flash-image` or `gemini-3-pro-image`) for rendering, fully unifying the AI pipeline under Gemini.

### Changed
- **Next.js 16 Proxy Migration**
  - Renamed deprecated `src/middleware.ts` to `src/proxy.ts` and refactored the exported function to `proxy`, complying with Next.js 16 conventions and removing build deprecation warnings.
- **Image Model Display Mappings**: Swapped image pipeline models to the official Google Studio native Gemini image models:
  - Mapped "NanoBnana2.0" (default) to `gemini-3.1-flash-image`.
  - Mapped "NanoBnana Pro" (high quality) to `gemini-3-pro-image`.
  - Removed old `gemini-2.5-flash-image` to align with the latest Studio versions.

### Fixed
- **Button DOM Hydration/Reconciliation Mismatch**: Wrapped conditional loading button texts in `<span>` tags (Style DNA submit, Fabric Swatch submit, and Project creation submit) to prevent React 19's `insertBefore` runtime crash when rendering conditional Loader spinners.
- **Incorrect Model ID for Gemini 3.1 Pro**: Fixed the synthesis model ID from `gemini-3.1-pro` to the correct Google AI Studio API identifier `gemini-3.1-pro-preview` to resolve the 404 NOT_FOUND error.


