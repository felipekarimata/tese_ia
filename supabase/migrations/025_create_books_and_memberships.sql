-- Livros persistentes agrupam capítulos existentes sem mover ou duplicar uploads.
CREATE TABLE IF NOT EXISTS public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.book_chapters (
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  chapter_order INTEGER NOT NULL CHECK (chapter_order > 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, chapter_id),
  CONSTRAINT book_chapters_one_book_per_chapter UNIQUE (chapter_id),
  CONSTRAINT book_chapters_unique_order UNIQUE (book_id, chapter_order)
);

CREATE INDEX IF NOT EXISTS idx_book_chapters_book_order
  ON public.book_chapters (book_id, chapter_order);

CREATE OR REPLACE FUNCTION public.touch_book_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS touch_books_updated_at ON public.books;
CREATE TRIGGER touch_books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.touch_book_updated_at();

DROP TRIGGER IF EXISTS touch_book_chapters_updated_at ON public.book_chapters;
CREATE TRIGGER touch_book_chapters_updated_at
  BEFORE UPDATE ON public.book_chapters
  FOR EACH ROW EXECUTE FUNCTION public.touch_book_updated_at();

-- Associa ou transfere um capítulo para o fim de um livro em uma única transação.
CREATE OR REPLACE FUNCTION public.assign_chapter_to_book(
  p_book_id UUID,
  p_chapter_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_next_order INTEGER;
  v_previous_book_id UUID;
BEGIN
  PERFORM 1 FROM public.books WHERE id = p_book_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Livro não encontrado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chapters WHERE id = p_chapter_id) THEN
    RAISE EXCEPTION 'Capítulo não encontrado';
  END IF;

  SELECT book_id INTO v_previous_book_id
    FROM public.book_chapters
   WHERE chapter_id = p_chapter_id;

  SELECT COALESCE(MAX(chapter_order), 0) + 1
    INTO v_next_order
    FROM public.book_chapters
   WHERE book_id = p_book_id;

  INSERT INTO public.book_chapters (book_id, chapter_id, chapter_order)
  VALUES (p_book_id, p_chapter_id, v_next_order)
  ON CONFLICT (chapter_id) DO UPDATE
    SET book_id = EXCLUDED.book_id,
        chapter_order = EXCLUDED.chapter_order,
        updated_at = now();

  UPDATE public.books
     SET updated_at = now()
   WHERE id = p_book_id OR id = v_previous_book_id;
  RETURN v_next_order;
END;
$$ LANGUAGE plpgsql;

-- Reordena todos os capítulos do livro sem colisões no índice único.
CREATE OR REPLACE FUNCTION public.reorder_book_chapters(
  p_book_id UUID,
  p_chapter_ids UUID[]
)
RETURNS VOID AS $$
DECLARE
  v_expected INTEGER;
  v_received INTEGER;
  v_distinct INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_expected
    FROM public.book_chapters
   WHERE book_id = p_book_id;
  v_received := COALESCE(cardinality(p_chapter_ids), 0);
  SELECT COUNT(DISTINCT item) INTO v_distinct
    FROM unnest(COALESCE(p_chapter_ids, ARRAY[]::UUID[])) AS items(item);

  IF v_received <> v_expected OR v_distinct <> v_expected THEN
    RAISE EXCEPTION 'A ordem deve conter cada capítulo do livro exatamente uma vez';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(p_chapter_ids) AS requested(chapter_id)
      LEFT JOIN public.book_chapters bc
        ON bc.book_id = p_book_id AND bc.chapter_id = requested.chapter_id
     WHERE bc.chapter_id IS NULL
  ) THEN
    RAISE EXCEPTION 'A ordem contém capítulo que não pertence ao livro';
  END IF;

  UPDATE public.book_chapters
     SET chapter_order = chapter_order + 1000000
   WHERE book_id = p_book_id;

  UPDATE public.book_chapters bc
     SET chapter_order = ordered.position::INTEGER,
         updated_at = now()
    FROM unnest(p_chapter_ids) WITH ORDINALITY AS ordered(chapter_id, position)
   WHERE bc.book_id = p_book_id
     AND bc.chapter_id = ordered.chapter_id;

  UPDATE public.books SET updated_at = now() WHERE id = p_book_id;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to books" ON public.books;
CREATE POLICY "Allow all access to books" ON public.books FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to book_chapters" ON public.book_chapters;
CREATE POLICY "Allow all access to book_chapters" ON public.book_chapters FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_chapters TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_chapter_to_book(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_book_chapters(UUID, UUID[]) TO anon, authenticated;

COMMENT ON TABLE public.books IS 'Livros que agrupam capítulos existentes para contexto editorial compartilhado.';
COMMENT ON TABLE public.book_chapters IS 'Associação ordenada; um capítulo pode pertencer a um livro por vez.';
