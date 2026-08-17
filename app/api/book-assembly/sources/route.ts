import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { formatBookSourceTitle } from '@/lib/book-assembly/sources';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [{ data: theses, error: thesesError }, { data: chapters, error: chaptersError }] = await Promise.all([
      (supabase as any)
        .from('theses')
        .select('id, title, description, updated_at')
        .order('updated_at', { ascending: false }),
      (supabase as any)
        .from('chapters')
        .select('id, thesis_id, title, chapter_order, current_version_id, updated_at'),
    ]);
    if (thesesError) throw new Error(`Falha ao carregar uploads: ${thesesError.message}`);
    if (chaptersError) throw new Error(`Falha ao carregar capítulos: ${chaptersError.message}`);

    const chapterIds = (chapters || []).map((chapter: any) => chapter.id);
    const { data: versions, error: versionsError } = chapterIds.length > 0
      ? await (supabase as any)
          .from('chapter_versions')
          .select('id, chapter_id, version_number, file_path, pages, created_by_operation, metadata, created_at')
          .in('chapter_id', chapterIds)
          .order('version_number', { ascending: false })
      : { data: [], error: null };
    if (versionsError) throw new Error(`Falha ao carregar versões: ${versionsError.message}`);

    const thesisMap = new Map((theses || []).map((thesis: any) => [thesis.id, thesis]));
    const versionsByChapter = new Map<string, any[]>();
    for (const version of versions || []) {
      const current = versionsByChapter.get(version.chapter_id) || [];
      current.push(version);
      versionsByChapter.set(version.chapter_id, current);
    }

    const sources = (chapters || [])
      .map((chapter: any) => {
        const thesis = thesisMap.get(chapter.thesis_id) as any;
        if (!thesis) return null;
        const chapterVersions = (versionsByChapter.get(chapter.id) || []).map((version: any) => ({
          id: version.id,
          versionNumber: Number(version.version_number || 1),
          filePath: String(version.file_path || ''),
          pages: version.pages == null ? null : Number(version.pages),
          createdByOperation: String(version.created_by_operation || 'upload'),
          metadata: version.metadata || {},
          createdAt: version.created_at,
          isCurrent: version.id === chapter.current_version_id,
        }));

        return {
          id: chapter.id,
          thesisId: thesis.id,
          thesisTitle: thesis.title,
          thesisDescription: thesis.description,
          chapterTitle: chapter.title,
          chapterOrder: Number(chapter.chapter_order || 1),
          title: formatBookSourceTitle(
            String(thesis.title),
            String(chapter.title),
            Number(chapter.chapter_order || 1)
          ),
          updatedAt: chapter.updated_at || thesis.updated_at,
          versions: chapterVersions,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const dateDifference = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (dateDifference !== 0) return dateDifference;
        return a.chapterOrder - b.chapterOrder;
      });

    return NextResponse.json(
      { sources },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
