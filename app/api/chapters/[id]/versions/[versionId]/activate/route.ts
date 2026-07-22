import { NextRequest, NextResponse } from 'next/server';
import { activateChapterVersion } from '@/lib/multi-ai/chapter-helpers';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id: chapterId, versionId } = await params;

    const { data: version, error } = await supabase
      .from('chapter_versions')
      .select('id, chapter_id')
      .eq('id', versionId)
      .eq('chapter_id', chapterId)
      .single();

    if (error || !version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    await activateChapterVersion(chapterId, versionId);
    return NextResponse.json({ success: true, versionId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
