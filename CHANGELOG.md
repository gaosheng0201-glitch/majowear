# Changelog - AI Personal Fashion Studio MVP

All notable changes and implementations for the AI Personal Fashion Studio project are documented in this file.

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


