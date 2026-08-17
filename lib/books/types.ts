export type BookSummary = {
  id: string;
  title: string;
  description: string | null;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BookMembership = {
  bookId: string;
  bookTitle: string;
  chapterOrder: number;
};

export type BookChapterSource = {
  id: string;
  title: string;
  sourceId: string;
  sourceTitle: string;
  sourceOrder: number;
  updatedAt: string;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  currentVersionFilePath: string | null;
  membership: BookMembership | null;
};

export type BookDetails = BookSummary & {
  chapters: BookChapterSource[];
};

export type BookContextChapter = {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  currentVersionId: string;
};

export type ChapterBookContextMetadata = {
  bookId: string;
  bookTitle: string;
  currentChapterOrder: number;
  chapters: BookContextChapter[];
};
