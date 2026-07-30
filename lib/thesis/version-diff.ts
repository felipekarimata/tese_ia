export type DiffSegment = {
  type: 'equal' | 'removed' | 'added';
  text: string;
};

export type DiffRow = {
  type: 'equal' | 'changed' | 'removed' | 'added';
  leftText: string;
  rightText: string;
  leftSegments?: DiffSegment[];
  rightSegments?: DiffSegment[];
  changeIndex?: number;
};

export type VersionDiffResult = {
  rows: DiffRow[];
  changedParagraphs: number;
  insertedParagraphs: number;
  removedParagraphs: number;
  totalChangeRows: number;
};

type ParagraphOperation =
  | { type: 'equal'; leftText: string; rightText: string }
  | { type: 'removed'; leftText: string }
  | { type: 'added'; rightText: string };

type TokenOperation = {
  type: 'equal' | 'removed' | 'added';
  text: string;
};

const MAX_INLINE_DIFF_TOKENS = 600;

function splitParagraphs(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean);
}

function buildLcsMatrix<T>(left: T[], right: T[]): number[][] {
  const matrix = Array.from(
    { length: left.length + 1 },
    () => new Array<number>(right.length + 1).fill(0)
  );

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      matrix[leftIndex][rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? matrix[leftIndex - 1][rightIndex - 1] + 1
        : Math.max(matrix[leftIndex - 1][rightIndex], matrix[leftIndex][rightIndex - 1]);
    }
  }

  return matrix;
}

function computeParagraphOperations(oldText: string, newText: string): ParagraphOperation[] {
  const oldParagraphs = splitParagraphs(oldText);
  const newParagraphs = splitParagraphs(newText);
  const matrix = buildLcsMatrix(oldParagraphs, newParagraphs);
  const operations: ParagraphOperation[] = [];
  let leftIndex = oldParagraphs.length;
  let rightIndex = newParagraphs.length;

  while (leftIndex > 0 || rightIndex > 0) {
    if (
      leftIndex > 0
      && rightIndex > 0
      && oldParagraphs[leftIndex - 1] === newParagraphs[rightIndex - 1]
    ) {
      operations.unshift({
        type: 'equal',
        leftText: oldParagraphs[leftIndex - 1],
        rightText: newParagraphs[rightIndex - 1]
      });
      leftIndex--;
      rightIndex--;
    } else if (
      rightIndex > 0
      && (leftIndex === 0 || matrix[leftIndex][rightIndex - 1] >= matrix[leftIndex - 1][rightIndex])
    ) {
      operations.unshift({ type: 'added', rightText: newParagraphs[rightIndex - 1] });
      rightIndex--;
    } else {
      operations.unshift({ type: 'removed', leftText: oldParagraphs[leftIndex - 1] });
      leftIndex--;
    }
  }

  return operations;
}

function tokenize(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

function mergeTokenOperations(operations: TokenOperation[]): DiffSegment[] {
  const segments: DiffSegment[] = [];
  for (const operation of operations) {
    const previous = segments[segments.length - 1];
    if (previous?.type === operation.type) {
      previous.text += operation.text;
    } else {
      segments.push({ ...operation });
    }
  }
  return segments;
}

export function computeInlineDiff(
  oldText: string,
  newText: string
): { left: DiffSegment[]; right: DiffSegment[] } {
  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  if (oldTokens.length + newTokens.length > MAX_INLINE_DIFF_TOKENS) {
    return {
      left: [{ type: 'removed', text: oldText }],
      right: [{ type: 'added', text: newText }]
    };
  }

  const matrix = buildLcsMatrix(oldTokens, newTokens);
  const leftOperations: TokenOperation[] = [];
  const rightOperations: TokenOperation[] = [];
  let leftIndex = oldTokens.length;
  let rightIndex = newTokens.length;

  while (leftIndex > 0 || rightIndex > 0) {
    if (
      leftIndex > 0
      && rightIndex > 0
      && oldTokens[leftIndex - 1] === newTokens[rightIndex - 1]
    ) {
      leftOperations.unshift({ type: 'equal', text: oldTokens[leftIndex - 1] });
      rightOperations.unshift({ type: 'equal', text: newTokens[rightIndex - 1] });
      leftIndex--;
      rightIndex--;
    } else if (
      rightIndex > 0
      && (leftIndex === 0 || matrix[leftIndex][rightIndex - 1] >= matrix[leftIndex - 1][rightIndex])
    ) {
      rightOperations.unshift({ type: 'added', text: newTokens[rightIndex - 1] });
      rightIndex--;
    } else {
      leftOperations.unshift({ type: 'removed', text: oldTokens[leftIndex - 1] });
      leftIndex--;
    }
  }

  return {
    left: mergeTokenOperations(leftOperations),
    right: mergeTokenOperations(rightOperations)
  };
}

function appendChangedBlock(rows: DiffRow[], operations: ParagraphOperation[]): void {
  const removed = operations
    .filter((operation): operation is Extract<ParagraphOperation, { type: 'removed' }> => operation.type === 'removed')
    .map(operation => operation.leftText);
  const added = operations
    .filter((operation): operation is Extract<ParagraphOperation, { type: 'added' }> => operation.type === 'added')
    .map(operation => operation.rightText);
  const blockLength = Math.max(removed.length, added.length);

  for (let index = 0; index < blockLength; index++) {
    const leftText = removed[index] ?? '';
    const rightText = added[index] ?? '';
    if (leftText && rightText) {
      const inline = computeInlineDiff(leftText, rightText);
      rows.push({
        type: 'changed',
        leftText,
        rightText,
        leftSegments: inline.left,
        rightSegments: inline.right
      });
    } else if (leftText) {
      rows.push({ type: 'removed', leftText, rightText: '' });
    } else {
      rows.push({ type: 'added', leftText: '', rightText });
    }
  }
}

export function computeVersionDiff(oldText: string, newText: string): VersionDiffResult {
  const operations = computeParagraphOperations(oldText, newText);
  const rows: DiffRow[] = [];
  let operationIndex = 0;

  while (operationIndex < operations.length) {
    const operation = operations[operationIndex];
    if (operation.type === 'equal') {
      rows.push({
        type: 'equal',
        leftText: operation.leftText,
        rightText: operation.rightText
      });
      operationIndex++;
      continue;
    }

    const changedBlock: ParagraphOperation[] = [];
    while (operationIndex < operations.length && operations[operationIndex].type !== 'equal') {
      changedBlock.push(operations[operationIndex]);
      operationIndex++;
    }
    appendChangedBlock(rows, changedBlock);
  }

  let changeIndex = 0;
  for (const row of rows) {
    if (row.type === 'equal') continue;
    row.changeIndex = changeIndex;
    changeIndex++;
  }

  return {
    rows,
    changedParagraphs: rows.filter(row => row.type === 'changed').length,
    insertedParagraphs: rows.filter(row => row.type === 'added').length,
    removedParagraphs: rows.filter(row => row.type === 'removed').length,
    totalChangeRows: changeIndex
  };
}
