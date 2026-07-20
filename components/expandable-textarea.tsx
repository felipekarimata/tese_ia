'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Maximize2, Minimize2, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ExpandableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  minRows?: number;
  maxRows?: number;
}

export function ExpandableTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  id,
  className,
  minRows = 4,
  maxRows = 20
}: ExpandableTextareaProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {value.length} caracteres
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="gap-2"
            >
              {isExpanded ? (
                <>
                  <Minimize2 className="h-4 w-4" />
                  Minimizar
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" />
                  Expandir
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(true)}
              className="gap-2"
            >
              <Maximize className="h-4 w-4" />
              Tela Cheia
            </Button>
          </div>
        </div>
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={isExpanded ? maxRows : minRows}
          className={cn(
            'resize-y transition-all',
            isExpanded && 'min-h-[400px]',
            className
          )}
        />
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Editor em Tela Cheia</DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex flex-col gap-2 min-h-0">
            <div className="text-sm text-muted-foreground">
              {value.length} caracteres
            </div>
            <Textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="flex-1 resize-none min-h-0 h-full"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
