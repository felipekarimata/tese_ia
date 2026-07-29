'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function ChapterUpdateRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params.id as string;

  useEffect(() => {
    router.replace(`/chapters/${chapterId}/agent`);
  }, [chapterId, router]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Abrindo agente...
    </div>
  );
}
