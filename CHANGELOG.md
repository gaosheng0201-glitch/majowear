# Changelog - AI Personal Fashion Studio MVP

All notable changes and implementations for the AI Personal Fashion Studio project are documented in this file.

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


