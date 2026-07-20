-- Jobs de normas em capítulos usam chapter_version_id; document_id referencia apenas documents(id).
ALTER TABLE norm_update_jobs
  ALTER COLUMN document_id DROP NOT NULL;
