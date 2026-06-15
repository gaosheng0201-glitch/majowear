-- Enable vector extension for Style/Fabric matching
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own projects" ON public.projects FOR ALL USING (auth.uid() = user_id);

-- 2. Style DNA
CREATE TABLE public.style_dnas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  reference_images TEXT[] DEFAULT '{}'::TEXT[],
  keywords TEXT[] DEFAULT '{}'::TEXT[],
  colors TEXT[] DEFAULT '{}'::TEXT[],
  silhouettes TEXT[] DEFAULT '{}'::TEXT[],
  materials TEXT[] DEFAULT '{}'::TEXT[],
  details TEXT[] DEFAULT '{}'::TEXT[],
  avoid TEXT[] DEFAULT '{}'::TEXT[],
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.style_dnas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own style DNAs" ON public.style_dnas FOR ALL USING (auth.uid() = user_id);

-- 3. Fabric Cards
CREATE TABLE public.fabric_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image TEXT,
  composition TEXT,
  weight_gsm INTEGER,
  texture TEXT,
  drape TEXT,
  stretch TEXT,
  sheen TEXT,
  transparency TEXT,
  prompt_description TEXT,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.fabric_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own fabric cards" ON public.fabric_cards FOR ALL USING (auth.uid() = user_id);

-- 4. Garment Cards
CREATE TABLE public.garment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  style_dna_id UUID REFERENCES public.style_dnas(id) ON DELETE SET NULL,
  fabric_card_id UUID REFERENCES public.fabric_cards(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  images TEXT[] DEFAULT '{}'::TEXT[],
  schema JSONB DEFAULT '{}'::jsonb NOT NULL,
  prompt TEXT,
  negative_prompt TEXT,
  design_rationale TEXT,
  parent_version_id UUID REFERENCES public.garment_cards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.garment_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own garment cards" ON public.garment_cards FOR ALL USING (auth.uid() = user_id);

-- 5. Collections
CREATE TABLE public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  garment_ids UUID[] DEFAULT '{}'::UUID[],
  cover_image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own collections" ON public.collections FOR ALL USING (auth.uid() = user_id);

-- 6. Generation Tasks
CREATE TABLE public.generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed')),
  input JSONB NOT NULL,
  output JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
ALTER TABLE public.generation_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own generation tasks" ON public.generation_tasks FOR ALL USING (auth.uid() = user_id);

-- Storage bucket creation for design_assets
INSERT INTO storage.buckets (id, name, public) VALUES ('design_assets', 'design_assets', true);
CREATE POLICY "Users can upload their own assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'design_assets' AND auth.uid() = owner);
CREATE POLICY "Users can update their own assets" ON storage.objects FOR UPDATE USING (bucket_id = 'design_assets' AND auth.uid() = owner);
CREATE POLICY "Users can delete their own assets" ON storage.objects FOR DELETE USING (bucket_id = 'design_assets' AND auth.uid() = owner);
CREATE POLICY "Public access to view design assets" ON storage.objects FOR SELECT USING (bucket_id = 'design_assets');
