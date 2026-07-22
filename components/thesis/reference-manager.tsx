'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Link as LinkIcon,
  FileText,
  Upload,
  X,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

export type ReferenceItem = {
  id: string;
  type: 'link' | 'file';
  title: string;
  description?: string;
  // For links
  url?: string;
  // For files
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
};

type ReferenceManagerProps = {
  references: ReferenceItem[];
  onChange: (references: ReferenceItem[]) => void;
  maxReferences?: number;
};

export function ReferenceManager({
  references,
  onChange,
  maxReferences = 10,
}: ReferenceManagerProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [testingLink, setTestingLink] = useState(false);
  const [linkTestResult, setLinkTestResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

  const [fileTitle, setFileTitle] = useState('');
  const [fileDescription, setFileDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  const testLink = async () => {
    if (!linkUrl.trim()) {
      toast.error('Por favor, insira uma URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(linkUrl);
    } catch {
      toast.error('URL inválida');
      return;
    }

    setTestingLink(true);
    setLinkTestResult(null);

    try {
      const response = await fetch('/api/references/test-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkUrl }),
      });

      const data = await response.json();

      if (data.success) {
        setLinkTestResult({
          success: true,
          message: data.message || 'Link acessível!',
          details: data.contentType ? `Tipo: ${data.contentType}` : undefined,
        });
        toast.success('Link testado com sucesso!');
      } else {
        setLinkTestResult({
          success: false,
          message: data.error || 'Erro ao acessar link',
          details: data.details,
        });
        toast.error(data.error || 'Erro ao acessar link');
      }
    } catch (error: any) {
      setLinkTestResult({
        success: false,
        message: 'Erro ao testar link',
        details: error.message,
      });
      toast.error('Erro ao testar link');
    } finally {
      setTestingLink(false);
    }
  };

  const addLink = () => {
    if (!linkUrl.trim()) {
      toast.error('Por favor, insira uma URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(linkUrl);
    } catch {
      toast.error('URL inválida');
      return;
    }

    if (references.length >= maxReferences) {
      toast.error(`Máximo de ${maxReferences} referências`);
      return;
    }

    const newReference: ReferenceItem = {
      id: `link_${Date.now()}`,
      type: 'link',
      title: linkTitle.trim() || linkUrl,
      description: linkDescription.trim() || undefined,
      url: linkUrl,
    };

    onChange([...references, newReference]);
    setLinkUrl('');
    setLinkTitle('');
    setLinkDescription('');
    toast.success('Link adicionado');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (references.length >= maxReferences) {
      toast.error(`Máximo de ${maxReferences} referências`);
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('file', file);
      if (fileTitle.trim()) formData.append('title', fileTitle.trim());
      if (fileDescription.trim()) formData.append('description', fileDescription.trim());

      const response = await fetch('/api/references/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Falha ao fazer upload');
      }

      const data = await response.json();

      const newReference: ReferenceItem = {
        id: `file_${Date.now()}`,
        type: 'file',
        title: data.file.title,
        description: data.file.description || undefined,
        filePath: data.file.path,
        fileName: data.file.name,
        fileSize: data.file.size,
        mimeType: data.file.mimeType,
      };

      onChange([...references, newReference]);
      setFileTitle('');
      setFileDescription('');
      toast.success('Arquivo enviado com sucesso');

      // Reset file input
      e.target.value = '';
    } catch (error: any) {
      console.error('[REFERENCE-MANAGER] Upload error:', error);
      toast.error(error.message || 'Erro ao fazer upload');
    } finally {
      setUploading(false);
    }
  };

  const removeReference = (id: string) => {
    onChange(references.filter((ref) => ref.id !== id));
    toast.success('Referência removida');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="link" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="link">
            <LinkIcon className="h-4 w-4 mr-2" />
            Adicionar Link
          </TabsTrigger>
          <TabsTrigger value="file">
            <Upload className="h-4 w-4 mr-2" />
            Enviar Arquivo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="link" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-url">URL *</Label>
            <Input
              id="link-url"
              placeholder="https://exemplo.com/artigo"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                setLinkTestResult(null); // Clear test result when URL changes
              }}
              onKeyDown={(e) => e.key === 'Enter' && addLink()}
            />
          </div>

          {/* Test Result Display */}
          {linkTestResult && (
            <div
              className={`p-3 rounded-lg border ${
                linkTestResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {linkTestResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      linkTestResult.success ? 'text-green-900' : 'text-red-900'
                    }`}
                  >
                    {linkTestResult.message}
                  </p>
                  {linkTestResult.details && (
                    <p
                      className={`text-xs mt-1 ${
                        linkTestResult.success ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {linkTestResult.details}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="link-title">Título (opcional)</Label>
            <Input
              id="link-title"
              placeholder="Artigo sobre..."
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-description">Descrição (opcional)</Label>
            <Textarea
              id="link-description"
              placeholder="Este artigo discute..."
              value={linkDescription}
              onChange={(e) => setLinkDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={testLink}
              disabled={testingLink || !linkUrl.trim()}
              variant="outline"
              className="flex-1"
            >
              {testingLink ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Testar Link
                </>
              )}
            </Button>
            <Button onClick={addLink} className="flex-1">
              <LinkIcon className="h-4 w-4 mr-2" />
              Adicionar Link
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="file" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file-title">Título (opcional)</Label>
            <Input
              id="file-title"
              placeholder="Nome do documento"
              value={fileTitle}
              onChange={(e) => setFileTitle(e.target.value)}
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-description">Descrição (opcional)</Label>
            <Textarea
              id="file-description"
              placeholder="Este documento contém..."
              value={fileDescription}
              onChange={(e) => setFileDescription(e.target.value)}
              rows={2}
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-upload">Arquivo (PDF, DOCX, TXT, MD) *</Label>
            <Input
              id="file-upload"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <p className="text-xs text-muted-foreground">Máximo: 50MB</p>
          </div>

          {uploading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Enviando arquivo...</span>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* List of added references */}
      {references.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              Referências Adicionadas ({references.length}/{maxReferences})
            </Label>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {references.map((ref) => (
              <Card key={ref.id} className="border-muted">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {ref.type === 'link' ? (
                          <LinkIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        ) : (
                          <FileText className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                        <span className="font-medium text-sm truncate">{ref.title}</span>
                        <Badge variant="outline" className="text-xs">
                          {ref.type === 'link' ? 'Link' : 'Arquivo'}
                        </Badge>
                      </div>

                      {ref.description && (
                        <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
                          {ref.description}
                        </p>
                      )}

                      {ref.type === 'link' && ref.url && (
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1"
                        >
                          {ref.url.substring(0, 50)}
                          {ref.url.length > 50 && '...'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}

                      {ref.type === 'file' && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {ref.fileName}
                          {ref.fileSize && ` • ${formatFileSize(ref.fileSize)}`}
                        </div>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => removeReference(ref.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {references.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed rounded-lg border-muted">
          <p className="text-sm text-muted-foreground">
            Nenhuma referência adicionada ainda
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Adicione links ou arquivos para fornecer contexto adicional
          </p>
        </div>
      )}
    </div>
  );
}
