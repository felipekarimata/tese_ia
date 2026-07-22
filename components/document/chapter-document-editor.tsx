'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sanitizeDocumentHtml, htmlToPlainText } from '@/lib/docx/sanitize-html';
import { Edit3, Loader2, Save, Bold, Italic, List, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';
import './document-viewer.css';

type ChapterDocumentEditorProps = {
  chapterId: string;
  versionId: string;
  dark?: boolean;
  onTextChange?: (text: string) => void;
  onSaved?: (newVersionId: string) => void;
};

export function ChapterDocumentEditor({
  chapterId,
  versionId,
  dark = true,
  onTextChange,
  onSaved,
}: ChapterDocumentEditorProps) {
  const [html, setHtml] = useState('');
  const [plainText, setPlainText] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const initialHtmlRef = useRef('');

  const loadDocument = useCallback(async () => {
    if (!versionId) return;
    setLoading(true);
    setEditing(false);
    setDirty(false);
    try {
      const res = await fetch(`/api/chapters/${chapterId}/versions/${versionId}/text`);
      if (!res.ok) throw new Error('Falha ao carregar documento');
      const data = await res.json();
      const nextHtml = data.html || '';
      const nextText = data.text || '';
      setHtml(nextHtml);
      setPlainText(nextText);
      initialHtmlRef.current = nextHtml;
      onTextChange?.(nextText);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao carregar documento';
      toast.error(message);
      setHtml('');
      setPlainText('');
      onTextChange?.('');
    } finally {
      setLoading(false);
    }
  }, [chapterId, versionId, onTextChange]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.innerHTML = html;
      editorRef.current.focus();
    }
  }, [editing, html]);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    setDirty(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDirty(false);
    setHtml(initialHtmlRef.current);
  };

  const handleSave = async () => {
    if (!editorRef.current) return;
    const rawHtml = editorRef.current.innerHTML;
    const sanitized = sanitizeDocumentHtml(rawHtml);

    try {
      setSaving(true);
      const res = await fetch(`/api/chapters/${chapterId}/versions/${versionId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: sanitized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar edição');

      setEditing(false);
      setDirty(false);
      toast.success('Edição salva como nova versão.');
      onSaved?.(data.newVersionId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao salvar edição';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleInput = () => {
    setDirty(true);
    if (editorRef.current) {
      const nextPlain = htmlToPlainText(editorRef.current.innerHTML);
      setPlainText(nextPlain);
      onTextChange?.(nextPlain);
    }
  };

  const hasHeaderFooter = html.includes('data-doc-part="header"') || html.includes('data-doc-part="footer"');

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full overflow-hidden">
      <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between flex-shrink-0 gap-2">
        <span className="text-xs text-gray-600">
          {plainText.length.toLocaleString()} chars
        </span>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                disabled={saving}
                className="h-8 text-xs text-gray-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || !dirty}
                className="h-8 gap-1.5 bg-red-600 hover:bg-red-700 text-xs"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar versão
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={!html || loading}
              className="h-8 gap-1.5 text-xs text-gray-400 hover:text-white"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Editar
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="px-4 py-2 border-b border-white/10 flex items-center gap-1 flex-shrink-0 bg-black/20">
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-white" onClick={() => execCommand('bold')} title="Negrito">
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-white" onClick={() => execCommand('italic')} title="Itálico">
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-white" onClick={() => execCommand('insertUnorderedList')} title="Lista">
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-white" onClick={() => execCommand('insertOrderedList')} title="Lista numerada">
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          {hasHeaderFooter && (
            <span className="ml-auto text-[10px] text-gray-500">
              Cabeçalhos/rodapés são exibidos mas não editáveis aqui
            </span>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
        <div className="p-4 sm:p-6 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 text-red-500 animate-spin" />
            </div>
          ) : html ? (
            editing ? (
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                className={cn('document-viewer min-h-[200px]', dark && 'document-viewer--dark')}
              />
            ) : (
              <div
                className={cn('document-viewer max-w-full', dark && 'document-viewer--dark')}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">Não foi possível carregar o documento.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Read-only HTML viewer for project agent and similar pages. */
export function DocumentHtmlViewer({
  html,
  loading,
  dark = true,
  charCount,
  className,
}: {
  html: string;
  loading?: boolean;
  dark?: boolean;
  charCount?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col flex-1 min-h-0 overflow-hidden', className)}>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
        <div className="p-4 sm:p-6 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 text-red-500 animate-spin" />
            </div>
          ) : html ? (
            <>
              {charCount !== undefined && (
                <p className="text-xs text-gray-600 mb-3">{charCount.toLocaleString()} caracteres</p>
              )}
              <div
                className={cn('document-viewer max-w-full', dark && 'document-viewer--dark')}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </>
          ) : (
            <p className="text-gray-500 text-sm text-center py-8">Não foi possível carregar o documento.</p>
          )}
        </div>
      </div>
    </div>
  );
}
