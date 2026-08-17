'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  FileText,
  GripVertical,
  Library,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { BookChapterSource, BookSummary } from '@/lib/books/types';

function chapterDisplayTitle(chapter: BookChapterSource): string {
  return /^cap[ií]tulo\s+\d+$/i.test(chapter.title.trim())
    ? chapter.sourceTitle
    : chapter.title;
}

function chapterSubtitle(chapter: BookChapterSource): string | null {
  const display = chapterDisplayTitle(chapter);
  if (display === chapter.sourceTitle) return null;
  return chapter.sourceTitle;
}

async function responseJson(response: Response) {
  return response.json().catch(() => ({}));
}

export function BookLibraryWorkspace() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [chapters, setChapters] = useState<BookChapterSource[]>([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [chapterSearch, setChapterSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyChapterId, setBusyChapterId] = useState<string | null>(null);
  const [draggedChapterId, setDraggedChapterId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const loadAll = useCallback(async (preferredBookId?: string) => {
    setError('');
    try {
      const [booksResponse, chaptersResponse] = await Promise.all([
        fetch('/api/books', { cache: 'no-store' }),
        fetch('/api/books/sources', { cache: 'no-store' }),
      ]);
      const [booksData, chaptersData] = await Promise.all([
        responseJson(booksResponse),
        responseJson(chaptersResponse),
      ]);
      if (!booksResponse.ok) throw new Error(booksData.error || 'Falha ao carregar livros');
      if (!chaptersResponse.ok) throw new Error(chaptersData.error || 'Falha ao carregar capítulos');

      const loadedBooks: BookSummary[] = booksData.books || [];
      setBooks(loadedBooks);
      setChapters(chaptersData.chapters || []);
      setSelectedBookId((current) => {
        const desired = preferredBookId || current;
        if (desired && loadedBooks.some((book) => book.id === desired)) return desired;
        return loadedBooks[0]?.id || '';
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeBook = books.find((book) => book.id === selectedBookId) || null;
  const selectedChapters = useMemo(
    () => chapters
      .filter((chapter) => chapter.membership?.bookId === selectedBookId)
      .sort((a, b) => (a.membership?.chapterOrder || 0) - (b.membership?.chapterOrder || 0)),
    [chapters, selectedBookId]
  );
  const filteredBooks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    if (!query) return books;
    return books.filter((book) => [book.title, book.description || '']
      .some((value) => value.toLocaleLowerCase('pt-BR').includes(query)));
  }, [books, search]);
  const filteredChapterSources = useMemo(() => {
    const query = chapterSearch.trim().toLocaleLowerCase('pt-BR');
    return chapters.filter((chapter) => {
      if (!query) return true;
      return [chapter.title, chapter.sourceTitle, chapter.membership?.bookTitle || '']
        .some((value) => value.toLocaleLowerCase('pt-BR').includes(query));
    });
  }, [chapters, chapterSearch]);
  const unassignedCount = chapters.filter((chapter) => !chapter.membership).length;
  const siblingCount = Math.max(0, selectedChapters.length - 1);

  const openCreate = () => {
    setTitle('');
    setDescription('');
    setCreateOpen(true);
  };

  const openEdit = () => {
    if (!activeBook) return;
    setTitle(activeBook.title);
    setDescription(activeBook.description || '');
    setEditOpen(true);
  };

  const createBook = async () => {
    if (!title.trim()) return;
    try {
      setSaving(true);
      const response = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.error || 'Falha ao criar livro');
      await loadAll(data.book.id);
      setCreateOpen(false);
      toast.success(`Livro “${data.book.title}” criado.`);
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setSaving(false);
    }
  };

  const editBook = async () => {
    if (!activeBook || !title.trim()) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/books/${activeBook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.error || 'Falha ao atualizar livro');
      await loadAll(activeBook.id);
      setEditOpen(false);
      toast.success('Livro atualizado.');
    } catch (editError) {
      toast.error(editError instanceof Error ? editError.message : String(editError));
    } finally {
      setSaving(false);
    }
  };

  const deleteActiveBook = async () => {
    if (!activeBook) return;
    const confirmed = window.confirm(
      `Excluir o livro “${activeBook.title}”?\n\nOs ${selectedChapters.length} capítulo(s) continuarão disponíveis e nenhum upload ou versão será apagado.`
    );
    if (!confirmed) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/books/${activeBook.id}`, { method: 'DELETE' });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.error || 'Falha ao excluir livro');
      await loadAll();
      toast.success('Livro excluído. Os capítulos foram preservados.');
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setSaving(false);
    }
  };

  const addChapter = async (chapter: BookChapterSource) => {
    if (!activeBook) return;
    if (chapter.membership?.bookId === activeBook.id) return;
    if (chapter.membership) {
      const confirmed = window.confirm(
        `“${chapterDisplayTitle(chapter)}” está em “${chapter.membership.bookTitle}”.\n\nMover para “${activeBook.title}”? O upload e seu histórico serão preservados.`
      );
      if (!confirmed) return;
    }
    try {
      setBusyChapterId(chapter.id);
      const response = await fetch(`/api/books/${activeBook.id}/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: chapter.id }),
      });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.error || 'Falha ao adicionar capítulo');
      await loadAll(activeBook.id);
      toast.success(`Capítulo adicionado a “${activeBook.title}”.`);
    } catch (addError) {
      toast.error(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setBusyChapterId(null);
    }
  };

  const removeChapter = async (chapter: BookChapterSource) => {
    if (!activeBook) return;
    try {
      setBusyChapterId(chapter.id);
      const response = await fetch(`/api/books/${activeBook.id}/chapters/${chapter.id}`, {
        method: 'DELETE',
      });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.error || 'Falha ao retirar capítulo');
      await loadAll(activeBook.id);
      toast.success('Capítulo retirado do livro; o upload foi preservado.');
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : String(removeError));
    } finally {
      setBusyChapterId(null);
    }
  };

  const saveOrder = async (ordered: BookChapterSource[]) => {
    if (!activeBook) return;
    const previous = selectedChapters.map((chapter) => chapter.id);
    const orderMap = new Map(ordered.map((chapter, index) => [chapter.id, index + 1]));
    setChapters((current) => current.map((chapter) => {
      const nextOrder = orderMap.get(chapter.id);
      return nextOrder && chapter.membership?.bookId === activeBook.id
        ? { ...chapter, membership: { ...chapter.membership, chapterOrder: nextOrder } }
        : chapter;
    }));
    try {
      const response = await fetch(`/api/books/${activeBook.id}/chapters`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterIds: ordered.map((chapter) => chapter.id) }),
      });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(data.error || 'Falha ao salvar ordem');
    } catch (orderError) {
      const previousMap = new Map(previous.map((id, index) => [id, index + 1]));
      setChapters((current) => current.map((chapter) => {
        const oldOrder = previousMap.get(chapter.id);
        return oldOrder && chapter.membership?.bookId === activeBook.id
          ? { ...chapter, membership: { ...chapter.membership, chapterOrder: oldOrder } }
          : chapter;
      }));
      toast.error(orderError instanceof Error ? orderError.message : String(orderError));
    }
  };

  const moveChapter = (chapterId: string, delta: number) => {
    const index = selectedChapters.findIndex((chapter) => chapter.id === chapterId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= selectedChapters.length) return;
    const next = [...selectedChapters];
    [next[index], next[target]] = [next[target], next[index]];
    void saveOrder(next);
  };

  const dropChapter = (targetId: string) => {
    if (!draggedChapterId || draggedChapterId === targetId) return;
    const next = selectedChapters.filter((chapter) => chapter.id !== draggedChapterId);
    const targetIndex = next.findIndex((chapter) => chapter.id === targetId);
    const dragged = selectedChapters.find((chapter) => chapter.id === draggedChapterId);
    if (!dragged || targetIndex < 0) return;
    next.splice(targetIndex, 0, dragged);
    setDraggedChapterId(null);
    void saveOrder(next);
  };

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando livros e capítulos...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Não foi possível abrir Livros</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => { setLoading(true); void loadAll(); }}>Tentar novamente</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
            <Library className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Livros</h1>
            <p className="mt-1 max-w-3xl text-muted-foreground">
              Agrupe seus uploads como capítulos. O livro fornece contexto automático enquanto cada capítulo continua com suas próprias versões.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4" /> Novo livro
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Seus livros</CardTitle>
            <CardDescription>{books.length} livro{books.length === 1 ? '' : 's'} · {unassignedCount} capítulo{unassignedCount === 1 ? '' : 's'} sem livro</CardDescription>
            <div className="relative pt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar livro..." className="pl-9" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredBooks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {books.length === 0 ? 'Crie o primeiro livro para organizar seus capítulos.' : 'Nenhum livro encontrado.'}
              </div>
            ) : filteredBooks.map((book) => (
              <button
                key={book.id}
                type="button"
                onClick={() => setSelectedBookId(book.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selectedBookId === book.id
                    ? 'border-red-500/50 bg-red-500/10'
                    : 'border-white/10 hover:bg-white/5'
                }`}
              >
                <div className="flex items-start gap-3">
                  <BookOpen className={`mt-0.5 h-4 w-4 shrink-0 ${selectedBookId === book.id ? 'text-red-400' : 'text-muted-foreground'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{book.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{book.chapterCount} capítulo{book.chapterCount === 1 ? '' : 's'}</p>
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {!activeBook ? (
          <Card className="border-dashed">
            <CardContent className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
              <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h2 className="text-xl font-semibold">Nenhum livro selecionado</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Crie um livro e adicione os uploads que serão seus capítulos. Nada será agregado ou reescrito nesta etapa.
              </p>
              <Button onClick={openCreate} className="mt-6"><Plus className="h-4 w-4" /> Criar primeiro livro</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-2xl">{activeBook.title}</CardTitle>
                      <Badge variant="secondary">{selectedChapters.length} capítulo{selectedChapters.length === 1 ? '' : 's'}</Badge>
                    </div>
                    <CardDescription className="mt-2 max-w-2xl">
                      {activeBook.description || 'Sem descrição. Você pode adicionar uma orientação geral para identificar o livro.'}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={openEdit}><Pencil className="h-4 w-4" /> Editar</Button>
                    <Button variant="outline" size="sm" onClick={() => void deleteActiveBook()} disabled={saving}>
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4">
                  <p className="font-medium text-emerald-300">Contexto editorial automático</p>
                  <p className="mt-1 text-sm leading-6 text-emerald-100/75">
                    Ao trabalhar em um capítulo, {siblingCount === 1 ? 'o outro capítulo' : `os outros ${siblingCount} capítulos`} deste livro {siblingCount === 1 ? 'será usado' : 'serão usados'} como contexto somente leitura para manter continuidade e evitar repetições.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-xl">Capítulos em ordem</CardTitle>
                    <CardDescription className="mt-1">Arraste ou use as setas. A versão atual de cada capítulo alimenta o contexto do livro.</CardDescription>
                  </div>
                  <Button onClick={() => { setChapterSearch(''); setAddOpen(true); }}>
                    <Plus className="h-4 w-4" /> Adicionar capítulos
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedChapters.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center hover:bg-muted/20"
                  >
                    <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
                    <p className="font-medium">Este livro ainda não tem capítulos</p>
                    <p className="mt-1 text-sm text-muted-foreground">Escolha uploads já existentes; eles não serão copiados nem alterados.</p>
                  </button>
                ) : selectedChapters.map((chapter, index) => (
                  <div
                    key={chapter.id}
                    draggable
                    onDragStart={() => setDraggedChapterId(chapter.id)}
                    onDragEnd={() => setDraggedChapterId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropChapter(chapter.id)}
                    className={`group rounded-xl border bg-background p-4 transition-all ${draggedChapterId === chapter.id ? 'opacity-50' : 'hover:border-white/20'}`}
                  >
                    <div className="flex items-start gap-3">
                      <GripVertical className="mt-2 h-5 w-5 shrink-0 cursor-grab text-muted-foreground" />
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15 font-semibold text-red-300">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{chapterDisplayTitle(chapter)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {chapterSubtitle(chapter) && <span>Upload: {chapterSubtitle(chapter)}</span>}
                          {chapter.currentVersionNumber && <Badge variant="outline">v{chapter.currentVersionNumber} atual</Badge>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => moveChapter(chapter.id, -1)} disabled={index === 0} aria-label="Mover para cima">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => moveChapter(chapter.id, 1)} disabled={index === selectedChapters.length - 1} aria-label="Mover para baixo">
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => void removeChapter(chapter)} disabled={busyChapterId === chapter.id} aria-label="Retirar do livro">
                          {busyChapterId === chapter.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/chapters/${chapter.id}/agent`}>Abrir <ArrowRight className="h-4 w-4" /></Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo livro</DialogTitle>
            <DialogDescription>Crie o agrupamento agora; os capítulos podem ser adicionados depois e continuam independentes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="new-book-title">Título</Label><Input id="new-book-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="new-book-description">Descrição (opcional)</Label><Textarea id="new-book-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button onClick={() => void createBook()} disabled={!title.trim() || saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Criar livro</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar livro</DialogTitle><DialogDescription>Altere apenas a identificação do agrupamento.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label htmlFor="edit-book-title">Título</Label><Input id="edit-book-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="edit-book-description">Descrição</Label><Textarea id="edit-book-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button><Button onClick={() => void editBook()} disabled={!title.trim() || saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar capítulos a {activeBook?.title}</DialogTitle>
            <DialogDescription>Escolha uploads existentes. Se um capítulo já estiver em outro livro, ele será transferido somente após sua confirmação.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={chapterSearch} onChange={(event) => setChapterSearch(event.target.value)} placeholder="Buscar upload ou capítulo..." className="pl-9" />
          </div>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {filteredChapterSources.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum capítulo encontrado.</div>
            ) : filteredChapterSources.map((chapter) => {
              const here = chapter.membership?.bookId === activeBook?.id;
              return (
                <div key={chapter.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <FileText className="h-5 w-5 shrink-0 text-red-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{chapterDisplayTitle(chapter)}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {chapterSubtitle(chapter) && <span>{chapterSubtitle(chapter)}</span>}
                      {chapter.membership && <Badge variant={here ? 'secondary' : 'outline'}>{here ? 'Neste livro' : `Em: ${chapter.membership.bookTitle}`}</Badge>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={here ? 'secondary' : 'outline'}
                    disabled={here || busyChapterId === chapter.id}
                    onClick={() => void addChapter(chapter)}
                  >
                    {busyChapterId === chapter.id ? <Loader2 className="h-4 w-4 animate-spin" /> : here ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {here ? 'Adicionado' : chapter.membership ? 'Mover' : 'Adicionar'}
                  </Button>
                </div>
              );
            })}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Concluir</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
