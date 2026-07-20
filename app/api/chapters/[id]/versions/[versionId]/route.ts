import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * DELETE /api/chapters/[id]/versions/[versionId]
 * Deletes a specific version. The original (first) version cannot be deleted.
 * If the deleted version was current, the previous version becomes current.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: chapterId, versionId } = await params;

    // Fetch the version to delete
    const { data: version, error: vErr } = await supabase
      .from('chapter_versions')
      .select('*')
      .eq('id', versionId)
      .eq('chapter_id', chapterId)
      .single();

    if (vErr || !version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Count total versions for this chapter
    const { count, error: countErr } = await supabase
      .from('chapter_versions')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', chapterId);

    if (countErr) throw countErr;

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Não é possível excluir a única versão do capítulo.' },
        { status: 400 }
      );
    }

    const isCurrent = version.is_current;

    // Delete file from Supabase Storage
    if (version.file_path) {
      try {
        const { error: storageErr } = await supabase.storage
          .from('documents')
          .remove([version.file_path]);
        if (storageErr) {
          console.warn('[VERSION-DELETE] Storage remove failed (continuing):', storageErr.message);
        }
      } catch (e) {
        console.warn('[VERSION-DELETE] Storage exception (continuing):', e);
      }
    }

    // Delete chunks associated with this version
    await supabase
      .from('chapter_chunks')
      .delete()
      .eq('version_id', versionId);

    // Delete the version record
    const { error: delErr } = await supabase
      .from('chapter_versions')
      .delete()
      .eq('id', versionId);

    if (delErr) throw delErr;

    // If we deleted the current version, promote the newest remaining version
    if (isCurrent) {
      const { data: remaining } = await supabase
        .from('chapter_versions')
        .select('id')
        .eq('chapter_id', chapterId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

      if (remaining) {
        await supabase
          .from('chapters')
          .update({ current_version_id: remaining.id })
          .eq('id', chapterId);

        await supabase
          .from('chapter_versions')
          .update({ is_current: true })
          .eq('id', remaining.id);
      }
    }

    return NextResponse.json({ success: true, deletedVersionId: versionId });
  } catch (error: any) {
    console.error('[VERSION-DELETE] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
