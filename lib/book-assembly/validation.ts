import { supabase } from '@/lib/supabase';
import type { BookChapterSelection, CreateBookAssemblyInput } from './types';
import { isAIProvider, isBookAssemblyMode } from './types';
import { formatBookSourceTitle } from './sources';

export type ValidatedBookAssemblyInput = {
  thesis: { id: string; title: string } | null;
  title: string;
  mode: CreateBookAssemblyInput['mode'];
  provider: CreateBookAssemblyInput['provider'] | null;
  model: string | null;
  customInstructions: string;
  includeCoverPage: boolean;
  chapterSelections: BookChapterSelection[];
};

async function validateInput(
  value: unknown,
  options: { thesisId?: string } = {}
): Promise<ValidatedBookAssemblyInput> {
  const input = (value || {}) as Partial<CreateBookAssemblyInput>;
  if (!isBookAssemblyMode(input.mode)) {
    throw new Error('Escolha um modo válido de montagem');
  }
  if (!Array.isArray(input.chapterSelections) || input.chapterSelections.length === 0) {
    throw new Error('Selecione pelo menos um capítulo');
  }
  if (input.chapterSelections.length > 100) {
    throw new Error('Selecione no máximo 100 capítulos por montagem');
  }

  const chapterIds = input.chapterSelections.map((selection) => String(selection.chapterId || ''));
  if (chapterIds.some((id) => !id) || new Set(chapterIds).size !== chapterIds.length) {
    throw new Error('A seleção contém capítulos inválidos ou duplicados');
  }

  const versionIds = input.chapterSelections.map((selection) => String(selection.versionId || ''));
  if (versionIds.some((id) => !id)) throw new Error('Selecione uma versão para cada capítulo');

  let thesis: { id: string; title: string } | null = null;
  if (options.thesisId) {
    const { data, error } = await (supabase as any)
      .from('theses')
      .select('id, title')
      .eq('id', options.thesisId)
      .single();
    if (error || !data) throw new Error('Tese não encontrada');
    thesis = data;
  }

  const [{ data: chapters, error: chaptersError }, { data: versions, error: versionsError }] = await Promise.all([
    (supabase as any)
      .from('chapters')
      .select('id, thesis_id, title, chapter_order')
      .in('id', chapterIds),
    (supabase as any)
      .from('chapter_versions')
      .select('id, chapter_id, version_number, file_path, pages')
      .in('id', versionIds),
  ]);
  if (chaptersError) throw new Error(`Falha ao validar capítulos: ${chaptersError.message}`);
  if (versionsError) throw new Error(`Falha ao validar versões: ${versionsError.message}`);

  const sourceThesisIds = [...new Set((chapters || []).map((chapter: any) => chapter.thesis_id))];
  const { data: sourceTheses, error: sourceThesesError } = sourceThesisIds.length > 0
    ? await (supabase as any).from('theses').select('id, title').in('id', sourceThesisIds)
    : { data: [], error: null };
  if (sourceThesesError) {
    throw new Error(`Falha ao validar os uploads de origem: ${sourceThesesError.message}`);
  }

  const chapterMap = new Map((chapters || []).map((chapter: any) => [chapter.id, chapter]));
  const versionMap = new Map((versions || []).map((version: any) => [version.id, version]));
  const sourceThesisMap = new Map((sourceTheses || []).map((item: any) => [item.id, item]));
  const orderedInput = [...input.chapterSelections].sort(
    (a, b) => Number(a.order || 0) - Number(b.order || 0)
  );

  const chapterSelections = orderedInput.map((selection, index) => {
    const chapter = chapterMap.get(selection.chapterId) as any;
    const version = versionMap.get(selection.versionId) as any;
    if (!chapter) throw new Error('Um dos capítulos selecionados não foi encontrado');
    if (options.thesisId && chapter.thesis_id !== options.thesisId) {
      throw new Error('Um dos capítulos selecionados não pertence a esta tese');
    }
    if (!version || version.chapter_id !== chapter.id) {
      throw new Error(`A versão escolhida não pertence ao capítulo “${chapter.title}”`);
    }
    if (!String(version.file_path || '').toLowerCase().endsWith('.docx')) {
      throw new Error(`O capítulo “${chapter.title}” precisa estar em DOCX para montar o livro`);
    }

    const sourceThesis = sourceThesisMap.get(chapter.thesis_id) as any;
    const chapterTitle = options.thesisId
      ? chapter.title
      : formatBookSourceTitle(
          String(sourceThesis?.title || chapter.title),
          String(chapter.title),
          Number(chapter.chapter_order || index + 1)
        );

    return {
      chapterId: chapter.id,
      versionId: version.id,
      order: index + 1,
      chapterTitle,
      versionNumber: Number(version.version_number || 1),
      filePath: version.file_path,
      pages: version.pages == null ? null : Number(version.pages),
    } satisfies BookChapterSelection;
  });

  const title = String(input.title || thesis?.title || '').trim().slice(0, 240);
  if (!title) throw new Error('Informe o título do livro');

  let provider = null;
  let model = null;
  if (input.mode !== 'compile') {
    if (!isAIProvider(input.provider)) throw new Error('Selecione o provedor de IA');
    model = String(input.model || '').trim();
    if (!model) throw new Error('Selecione o modelo de IA');
    provider = input.provider;
  }

  return {
    thesis,
    title,
    mode: input.mode,
    provider,
    model,
    customInstructions: String(input.customInstructions || '').trim().slice(0, 12000),
    includeCoverPage: input.includeCoverPage !== false,
    chapterSelections,
  };
}

export function validateBookAssemblyInput(
  thesisId: string,
  value: unknown
): Promise<ValidatedBookAssemblyInput> {
  return validateInput(value, { thesisId });
}

export function validateGlobalBookAssemblyInput(
  value: unknown
): Promise<ValidatedBookAssemblyInput> {
  return validateInput(value);
}
