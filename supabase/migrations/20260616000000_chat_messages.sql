-- 7. Chat Messages
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  text TEXT,
  garment_card_id UUID REFERENCES public.garment_cards(id) ON DELETE SET NULL,
  image_urls TEXT[] DEFAULT '{}'::TEXT[],
  grounding_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access their own chat messages" ON public.chat_messages FOR ALL USING (auth.uid() = user_id);
