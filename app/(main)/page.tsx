'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImportDocumentDialog } from '@/components/import-document-dialog';
import { FileText, Sparkles, BookOpen, GraduationCap, Search, Upload, Folder, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

type Project = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
};

type Thesis = {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  chapterCount: number;
  chapterTitles?: string[];
};

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'theses' | 'projects'>('theses');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const searchNorm = searchQuery.trim().toLowerCase();
  const hasActiveSearch = searchNorm.length > 0;

  const filteredTheses = useMemo(() => {
    if (!hasActiveSearch) return theses;
    return theses.filter((t) => {
      const inTitle = t.title.toLowerCase().includes(searchNorm);
      const inDesc = (t.description || '').toLowerCase().includes(searchNorm);
      const inChapters = (t.chapterTitles || []).some((ct) => ct.toLowerCase().includes(searchNorm));
      return inTitle || inDesc || inChapters;
    });
  }, [theses, searchNorm, hasActiveSearch]);

  const filteredProjects = useMemo(() => {
    if (!hasActiveSearch) return projects;
    return projects.filter((p) => {
      const inName = p.name.toLowerCase().includes(searchNorm);
      const inDesc = (p.description || '').toLowerCase().includes(searchNorm);
      return inName || inDesc;
    });
  }, [projects, searchNorm, hasActiveSearch]);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Falha ao carregar projetos');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar projetos');
    }
  };

  const loadTheses = async () => {
    try {
      const res = await fetch('/api/theses');
      if (!res.ok) throw new Error('Falha ao carregar teses');
      const data = await res.json();
      setTheses(data.theses || []);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar teses');
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadProjects(), loadTheses()]);
    setLoading(false);
  };

  const handleCreated = () => {
    loadAll();
  };

  useEffect(() => {
    loadAll();
  }, []);

  const totalDocs = theses.length + projects.length;

  return (
    <div className="min-h-[calc(100vh-200px)] relative">
      {/* Background lights */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-20 right-20 w-[500px] h-[500px] bg-red-500/3 rounded-full blur-[100px]" />
        <div className="absolute bottom-20 left-20 w-[400px] h-[400px] bg-red-600/2 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-red-500/2 rounded-full blur-[120px]" />
      </div>

      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-gray-400 text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-red-500 flex-shrink-0" />
              Organize suas teses e documentos com inteligência artificial
            </p>
          </div>

          {/* Single primary CTA */}
          <Button
            onClick={() => setImportDialogOpen(true)}
            className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-500/20 transition-all transform hover:scale-105 active:scale-95 h-11 px-6 flex-shrink-0"
          >
            <Upload className="mr-2 h-4 w-4" />
            Importar Documento
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
            </div>
            <p className="text-gray-400 mt-6 text-sm">Carregando...</p>
          </div>
        ) : totalDocs === 0 ? (
          /* Empty state — first time */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full" />
              <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 p-7 rounded-2xl border border-white/10">
                <GraduationCap className="h-16 w-16 text-red-500" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Nenhum documento ainda
            </h2>
            <p className="text-gray-400 mb-3 max-w-md leading-relaxed">
              Importe seu primeiro documento para começar. Você pode trabalhar por capítulos ou com a tese completa.
            </p>

            {/* Explanation cards */}
            <div className="grid grid-cols-2 gap-3 mb-8 max-w-sm w-full">
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] text-left">
                <BookOpen className="h-5 w-5 text-red-400 mb-2" />
                <p className="text-xs font-semibold text-white mb-1">Tese</p>
                <p className="text-xs text-gray-500 leading-relaxed">Capítulos separados com versões individuais</p>
              </div>
              <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] text-left">
                <Folder className="h-5 w-5 text-red-400 mb-2" />
                <p className="text-xs font-semibold text-white mb-1">Projeto</p>
                <p className="text-xs text-gray-500 leading-relaxed">Documento completo gerenciado como um todo</p>
              </div>
            </div>

            <Button
              onClick={() => setImportDialogOpen(true)}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-500/30 h-12 px-8 text-base"
            >
              <Upload className="mr-2 h-5 w-5" />
              Importar Primeiro Documento
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'theses' | 'projects')} className="space-y-6">
            {/* Tabs + Search row */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <TabsList className="bg-white/5 p-1 flex-shrink-0">
                <TabsTrigger value="theses" className="data-[state=active]:bg-red-600 gap-2">
                  <BookOpen className="h-4 w-4" />
                  Teses
                  <Badge variant="secondary" className="bg-white/10 text-gray-400 text-xs px-1.5 py-0 ml-1">
                    {theses.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="projects" className="data-[state=active]:bg-red-600 gap-2">
                  <Folder className="h-4 w-4" />
                  Projetos
                  <Badge variant="secondary" className="bg-white/10 text-gray-400 text-xs px-1.5 py-0 ml-1">
                    {projects.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar..."
                  className="h-9 pl-9 border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus-visible:ring-red-500/40"
                />
              </div>
            </div>

            {/* Theses Tab */}
            <TabsContent value="theses" className="space-y-4 mt-0">
              {filteredTheses.length === 0 ? (
                <EmptyTabState
                  message={hasActiveSearch ? `Nenhum resultado para "${searchQuery}"` : 'Nenhuma tese criada'}
                  sub={hasActiveSearch ? 'Tente outro termo.' : 'Importe um documento e escolha "Tese" para organizar por capítulos.'}
                  onClear={hasActiveSearch ? () => setSearchQuery('') : undefined}
                  onImport={!hasActiveSearch ? () => setImportDialogOpen(true) : undefined}
                />
              ) : (
                <div className="space-y-3">
                  {hasActiveSearch && (
                    <p className="text-sm text-gray-400">
                      {filteredTheses.length} {filteredTheses.length === 1 ? 'resultado' : 'resultados'}
                    </p>
                  )}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTheses.map((thesis, index) => (
                      <DocumentCard
                        key={thesis.id}
                        id={thesis.id}
                        type="thesis"
                        href={`/theses/${thesis.id}/agent`}
                        icon={<GraduationCap className="h-6 w-6 text-red-500" />}
                        title={thesis.title}
                        description={thesis.description}
                        badge={`${thesis.chapterCount} ${thesis.chapterCount === 1 ? 'capítulo' : 'capítulos'}`}
                        index={index}
                        onDeleted={loadAll}
                      />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Projects Tab */}
            <TabsContent value="projects" className="space-y-4 mt-0">
              {filteredProjects.length === 0 ? (
                <EmptyTabState
                  message={hasActiveSearch ? `Nenhum resultado para "${searchQuery}"` : 'Nenhum projeto criado'}
                  sub={hasActiveSearch ? 'Tente outro termo.' : 'Importe um documento e escolha "Projeto" para gerenciar como documento completo.'}
                  onClear={hasActiveSearch ? () => setSearchQuery('') : undefined}
                  onImport={!hasActiveSearch ? () => setImportDialogOpen(true) : undefined}
                />
              ) : (
                <div className="space-y-3">
                  {hasActiveSearch && (
                    <p className="text-sm text-gray-400">
                      {filteredProjects.length} {filteredProjects.length === 1 ? 'resultado' : 'resultados'}
                    </p>
                  )}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredProjects.map((project, index) => (
                      <DocumentCard
                        key={project.id}
                        id={project.id}
                        type="project"
                        href={`/projects/${project.id}/agent`}
                        icon={<Folder className="h-6 w-6 text-red-500" />}
                        title={project.name}
                        description={project.description}
                        badge={`${project.documentCount} ${project.documentCount === 1 ? 'doc' : 'docs'}`}
                        index={index}
                        onDeleted={loadAll}
                      />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <ImportDocumentDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onCreated={handleCreated}
      />

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function DocumentCard({
  id,
  type,
  href,
  icon,
  title,
  description,
  badge,
  index,
  onDeleted,
}: {
  id: string;
  type: 'thesis' | 'project';
  href: string;
  icon: React.ReactNode;
  title: string;
  description?: string;
  badge: string;
  index: number;
  onDeleted?: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const label = type === 'thesis' ? 'tese' : 'projeto';
    const confirmed = window.confirm(
      `Excluir permanentemente ${label === 'tese' ? 'a' : 'o'} ${label} "${title}"?\n\nTodos os dados serão removidos. Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    try {
      setDeleting(true);
      const endpoint = type === 'thesis' ? `/api/theses/${id}` : `/api/projects/${id}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao excluir');
      }
      toast.success(`${type === 'thesis' ? 'Tese' : 'Projeto'} excluído com sucesso.`);
      onDeleted?.();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="group relative"
      style={{ animation: `fadeInUp 0.4s ease-out ${index * 0.07}s both` }}
    >
      <Link href={href} className="block">
        <div className="relative h-full">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-red-800 rounded-2xl opacity-0 group-hover:opacity-15 blur transition-all duration-300" />
          <Card className="relative h-full bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-white/10 hover:border-red-500/30 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-red-500/10 group-hover:-translate-y-0.5 cursor-pointer overflow-hidden">
            <CardHeader className="relative pb-3">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 bg-gradient-to-br from-red-500/15 to-red-600/10 rounded-xl border border-red-500/20 group-hover:border-red-500/40 transition-colors">
                  {icon}
                </div>
                <Badge variant="secondary" className="bg-white/10 text-gray-300 border-white/10 text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  {badge}
                </Badge>
              </div>
              <CardTitle className="line-clamp-1 text-base font-bold text-white group-hover:text-red-400 transition-colors">
                {title}
              </CardTitle>
              <CardDescription className="line-clamp-2 text-gray-400 text-sm leading-relaxed">
                {description || 'Sem descrição'}
              </CardDescription>
            </CardHeader>
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </Card>
        </div>
      </Link>

      {/* Trash icon — appears on hover, top-right corner */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-black/50 backdrop-blur-sm border border-white/10 text-gray-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 disabled:opacity-50"
        title={`Excluir ${type === 'thesis' ? 'tese' : 'projeto'}`}
      >
        {deleting
          ? <span className="block h-3.5 w-3.5 border border-gray-500 border-t-transparent rounded-full animate-spin" />
          : <Trash2 className="h-3.5 w-3.5" />
        }
      </button>
    </div>
  );
}

function EmptyTabState({
  message,
  sub,
  onClear,
  onImport,
}: {
  message: string;
  sub: string;
  onClear?: () => void;
  onImport?: () => void;
}) {
  return (
    <Card className="bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-xl border-white/10">
      <CardContent className="flex flex-col items-center justify-center py-14 px-8 text-center">
        <p className="text-gray-300 font-medium mb-2">{message}</p>
        <p className="text-gray-500 text-sm mb-6 max-w-xs leading-relaxed">{sub}</p>
        <div className="flex gap-2">
          {onClear && (
            <Button variant="outline" className="border-white/20 text-gray-300" onClick={onClear}>
              Limpar pesquisa
            </Button>
          )}
          {onImport && (
            <Button
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white"
              onClick={onImport}
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar Documento
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
