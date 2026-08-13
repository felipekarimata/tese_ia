'use client';

import { useParams } from 'next/navigation';
import { BookAssemblyWorkspace } from '@/components/thesis/book-assembly-workspace';

export default function BookAssemblyPage() {
  const params = useParams();
  return <BookAssemblyWorkspace thesisId={params.id as string} />;
}
