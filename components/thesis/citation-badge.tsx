'use client';

import { Badge } from '@/components/ui/badge';
import { BookOpen, FileText } from 'lucide-react';

export type CitationDisplayMode = 'minimal' | 'chapter' | 'version' | 'full';

type CitationData = {
  pageFrom: number;
  pageTo?: number;
  chapterOrder?: number;
  chapterTitle?: string;
  versionNumber?: number;
};

type CitationBadgeProps = {
  citation: CitationData;
  mode?: CitationDisplayMode;
  showIcon?: boolean;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
};

/**
 * Componente de citação adaptativa
 * Mostra informações de forma inteligente baseado no contexto:
 * - minimal: "pág 5" (quando só 1 capítulo)
 * - chapter: "Cap 1, pág 5" (quando múltiplos capítulos, mesma versão)
 * - version: "Cap 1 v2, pág 5" (quando múltiplas versões)
 * - full: Sempre mostra tudo
 */
export function CitationBadge({
  citation,
  mode = 'minimal',
  showIcon = true,
  variant = 'secondary'
}: CitationBadgeProps) {
  const formatPageRange = () => {
    if (citation.pageTo && citation.pageTo !== citation.pageFrom) {
      return `pág ${citation.pageFrom}-${citation.pageTo}`;
    }
    return `pág ${citation.pageFrom}`;
  };

  const getText = () => {
    switch (mode) {
      case 'minimal':
        return formatPageRange();

      case 'chapter':
        if (citation.chapterOrder !== undefined) {
          return `Cap ${citation.chapterOrder}, ${formatPageRange()}`;
        }
        return formatPageRange();

      case 'version':
        if (citation.chapterOrder !== undefined && citation.versionNumber !== undefined) {
          return `Cap ${citation.chapterOrder} v${citation.versionNumber}, ${formatPageRange()}`;
        }
        if (citation.chapterOrder !== undefined) {
          return `Cap ${citation.chapterOrder}, ${formatPageRange()}`;
        }
        return formatPageRange();

      case 'full':
        const parts = [];
        if (citation.chapterOrder !== undefined) {
          parts.push(`Cap ${citation.chapterOrder}`);
        }
        if (citation.versionNumber !== undefined) {
          parts.push(`v${citation.versionNumber}`);
        }
        parts.push(formatPageRange());
        return parts.join(', ');

      default:
        return formatPageRange();
    }
  };

  const getIcon = () => {
    if (!showIcon) return null;

    // Mostra ícone de livro se tiver capítulo, senão ícone de arquivo
    if (citation.chapterOrder !== undefined) {
      return <BookOpen className="h-3 w-3 mr-1" />;
    }
    return <FileText className="h-3 w-3 mr-1" />;
  };

  const getTooltip = () => {
    const parts = [];
    if (citation.chapterTitle) {
      parts.push(`Capítulo: ${citation.chapterTitle}`);
    }
    if (citation.versionNumber !== undefined) {
      parts.push(`Versão: ${citation.versionNumber}`);
    }
    parts.push(`Página${citation.pageTo && citation.pageTo !== citation.pageFrom ? 's' : ''}: ${citation.pageFrom}${citation.pageTo && citation.pageTo !== citation.pageFrom ? `-${citation.pageTo}` : ''}`);
    return parts.join(' | ');
  };

  return (
    <Badge
      variant={variant}
      className="text-xs inline-flex items-center cursor-help"
      title={getTooltip()}
    >
      {getIcon()}
      {getText()}
    </Badge>
  );
}

/**
 * Componente para exibir múltiplas citações
 */
type CitationListProps = {
  citations: CitationData[];
  mode?: CitationDisplayMode;
  maxVisible?: number;
};

export function CitationList({
  citations,
  mode = 'minimal',
  maxVisible = 3
}: CitationListProps) {
  const visibleCitations = citations.slice(0, maxVisible);
  const remainingCount = citations.length - maxVisible;

  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visibleCitations.map((citation, index) => (
        <CitationBadge
          key={index}
          citation={citation}
          mode={mode}
          showIcon={index === 0}
        />
      ))}
      {remainingCount > 0 && (
        <Badge variant="outline" className="text-xs">
          +{remainingCount}
        </Badge>
      )}
    </div>
  );
}

/**
 * Hook para determinar o modo de citação baseado no contexto
 */
export function useCitationMode(citations: CitationData[]): CitationDisplayMode {
  if (citations.length === 0) {
    return 'minimal';
  }

  const uniqueChapters = new Set(citations.map(c => c.chapterOrder).filter(Boolean));
  const uniqueVersions = new Set(citations.map(c => c.versionNumber).filter(Boolean));

  // Se só tem 1 capítulo
  if (uniqueChapters.size <= 1) {
    // Se só tem 1 versão, modo minimal
    if (uniqueVersions.size <= 1) {
      return 'minimal';
    }
    // Se tem múltiplas versões, mostra versão
    return 'version';
  }

  // Se tem múltiplos capítulos
  // Se todos são da mesma versão, só mostra capítulo
  if (uniqueVersions.size <= 1) {
    return 'chapter';
  }

  // Se tem múltiplos capítulos e múltiplas versões, mostra tudo
  return 'version';
}
