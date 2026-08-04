import test from 'node:test';
import assert from 'node:assert/strict';
import { completeBookWorkflowStep, createBookWorkflowState, parseBookWorkflowAction } from '../lib/book-workflow/state';
import { getSlashCommandName, isBookCommand, isChapterUtilityCommand } from '../lib/book-workflow/commands';
import { sanitizeEditorialText } from '../lib/book-workflow/output';

test('only the six editorial slash commands are active', () => {
  assert.equal(isBookCommand('/livro'), false);
  assert.equal(isBookCommand('/aprimorar'), true);
  assert.equal(isBookCommand('/todos'), true);
  assert.equal(isBookCommand('/3'), false);
  assert.equal(isBookCommand('/comparar'), false);
  assert.equal(isChapterUtilityCommand('/comparar'), true);
  assert.equal(getSlashCommandName('/ajustar algo'), '/ajustar');
});

test('book workflow requires P3 instructions and advances one approval at a time', () => {
  assert.throws(() => createBookWorkflowState(''), /instrução autoral/i);
  let state = createBookWorkflowState('preservar a conclusão', new Date('2026-01-01T00:00:00Z'));
  state = completeBookWorkflowStep(state, 1);
  assert.equal(state.nextStep, 2);
  state = completeBookWorkflowStep(state, 2);
  state = completeBookWorkflowStep(state, 3);
  state = completeBookWorkflowStep(state, 4);
  state = completeBookWorkflowStep(state, 5);
  assert.equal(state.status, 'completed');
  assert.deepEqual(parseBookWorkflowAction('aprovar'), { kind: 'continue' });
});

test('editorial output boundary removes reports and common reasoning leaks', () => {
  const delimited = `prefácio indevido\n===INÍCIO DO CAPÍTULO===\nTexto válido.\nWait.\n===FIM DO CAPÍTULO===\n===RELATÓRIO===\nlog`;
  assert.equal(sanitizeEditorialText(delimited), 'Texto válido.');
  assert.equal(sanitizeEditorialText('Texto válido.\n===RELATÓRIO===\nrisco'), 'Texto válido.');
});
