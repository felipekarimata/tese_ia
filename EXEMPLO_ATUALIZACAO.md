# Exemplo Prático: Atualizando Limites de Tokens

Este documento mostra exemplos práticos de como atualizar os arquivos para usar limites maiores de tokens.

## Exemplo 1: Atualizar section-analyzer.ts

### Antes:
```typescript
// lib/improvement/section-analyzer.ts (linhas 87-88)
const completion = await openai.chat.completions.create({
  model,
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_tokens: 4000,  // ❌ Limite baixo
  response_format: { type: 'json_object' }
});
```

### Depois (Opção A - Valor Fixo Alto):
```typescript
// lib/improvement/section-analyzer.ts (linhas 87-88)
const completion = await openai.chat.completions.create({
  model,
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_tokens: 12000,  // ✅ Limite alto para respostas detalhadas
  response_format: { type: 'json_object' }
});
```

### Depois (Opção B - Usando Configuração Centralizada):
```typescript
// lib/improvement/section-analyzer.ts
import { getTokenLimit, validateTokenLimit } from '@/lib/ai/token-limits';

// ... no código da função:
const maxTokens = validateTokenLimit(model, getTokenLimit('improvement', 'sectionAnalysis'));

const completion = await openai.chat.completions.create({
  model,
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_tokens: maxTokens,  // ✅ Usa configuração centralizada
  response_format: { type: 'json_object' }
});
```

---

## Exemplo 2: Atualizar document-analyzer.ts

### Antes:
```typescript
// lib/improvement/document-analyzer.ts (linha 252)
max_tokens: 2000,  // ❌ Limite muito baixo para análise global
```

### Depois:
```typescript
// lib/improvement/document-analyzer.ts (linha 252)
max_tokens: 8000,  // ✅ Limite alto para análise completa do documento
```

---

## Exemplo 3: Atualizar adapt/processor.ts (sem limite definido)

### Antes:
```typescript
// lib/adapt/processor.ts (linha 95)
const response = await client.chat.completions.create({
  model,
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  response_format: { type: 'json_object' }
  // ❌ Sem max_tokens definido (usa padrão do modelo)
});
```

### Depois:
```typescript
// lib/adapt/processor.ts (linha 95)
const response = await client.chat.completions.create({
  model,
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_tokens: 12000,  // ✅ Limite alto para adaptações detalhadas
  response_format: { type: 'json_object' }
});
```

---

## Exemplo 4: Atualizar Gemini (sem maxOutputTokens)

### Antes:
```typescript
// lib/adapt/processor.ts (linha 111)
generationConfig: {
  temperature: 0.3,
  responseMimeType: 'application/json'
  // ❌ Sem maxOutputTokens
}
```

### Depois:
```typescript
// lib/adapt/processor.ts (linha 111)
generationConfig: {
  temperature: 0.3,
  maxOutputTokens: 8192,  // ✅ Limite alto (máximo do Gemini)
  responseMimeType: 'application/json'
}
```

---

## Valores Recomendados por Operação

| Operação | Valor Recomendado | Motivo |
|----------|-------------------|--------|
| Análise de seções | 8,000 - 12,000 | Análises detalhadas precisam de espaço |
| Análise global | 4,000 - 8,000 | Resumos podem ser longos |
| Tradução | 8,000 - 16,000 | Textos traduzidos podem ser extensos |
| Adaptação | 8,000 - 12,000 | Adaptações complexas precisam de detalhes |
| Ajuste | 8,000 - 12,000 | Instruções customizadas podem gerar muito conteúdo |
| Chat geral | 4,000 - 8,000 | Respostas detalhadas mas não excessivas |

---

## Checklist de Atualização

- [ ] Atualizar `lib/improvement/section-analyzer.ts` (OpenAI e Gemini)
- [ ] Atualizar `lib/improvement/document-analyzer.ts` (OpenAI e Gemini)
- [ ] Atualizar `lib/thesis/chapter-operations.ts` (OpenAI e Gemini)
- [ ] Atualizar `lib/ai/openai.ts`
- [ ] Atualizar `lib/ai/gemini.ts`
- [ ] Atualizar `lib/adapt/processor.ts` (adicionar limites)
- [ ] Atualizar `lib/adjust/processor.ts` (adicionar limites)
- [ ] Verificar `lib/translation/translate-direct.ts` (parâmetro maxTokens)
- [ ] Testar com documentos reais
- [ ] Monitorar custos após mudanças

---

## Dica Final

Para respostas **muito detalhadas e quase sem limites**, use:

- **OpenAI GPT-4o**: `max_tokens: 16384` (máximo absoluto)
- **Gemini 1.5 Pro**: `maxOutputTokens: 8192` (máximo absoluto)

Isso permitirá respostas extremamente longas e detalhadas, mas aumentará significativamente os custos e tempo de resposta.
