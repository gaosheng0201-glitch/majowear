-- Add Agent Settings columns to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS agent_model TEXT DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS agent_style TEXT DEFAULT 'default',
ADD COLUMN IF NOT EXISTS image_resolution TEXT DEFAULT '1024x1024';
