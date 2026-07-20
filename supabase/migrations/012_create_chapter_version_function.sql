-- Create function to create a new chapter version
-- This function handles the version creation with proper parent-child relationship
CREATE OR REPLACE FUNCTION public.create_chapter_version(
  p_chapter_id UUID,
  p_file_path TEXT,
  p_parent_version_id UUID DEFAULT NULL,
  p_created_by_operation TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_version_id UUID;
  v_version_number INTEGER;
BEGIN
  -- Generate new UUID for version
  v_new_version_id := gen_random_uuid();

  -- Calculate version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM public.chapter_versions
  WHERE chapter_id = p_chapter_id;

  -- Insert new version
  INSERT INTO public.chapter_versions (
    id,
    chapter_id,
    version_number,
    file_path,
    parent_version_id,
    created_by_operation,
    metadata,
    created_at
  ) VALUES (
    v_new_version_id,
    p_chapter_id,
    v_version_number,
    p_file_path,
    p_parent_version_id,
    p_created_by_operation,
    p_metadata,
    NOW()
  );

  RETURN v_new_version_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_chapter_version(UUID, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- Also grant to anon (since theses allow all access)
GRANT EXECUTE ON FUNCTION public.create_chapter_version(UUID, TEXT, UUID, TEXT, JSONB) TO anon;
