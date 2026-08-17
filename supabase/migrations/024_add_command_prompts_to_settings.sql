-- Prompts editáveis dos comandos. Mantemos somente overrides: quando não houver
-- valor personalizado, o aplicativo usa o padrão versionado no código.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS command_prompts JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.settings
SET command_prompts = '{}'::jsonb
WHERE command_prompts IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.settings TO authenticated;

COMMENT ON COLUMN public.settings.command_prompts IS
  'Overrides persistentes dos prompts dos comandos e das etapas do /todos.';
