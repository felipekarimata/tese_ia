# Guia: Como Aumentar Limites de Tokens para Respostas Mais Detalhadas

Este guia explica como aumentar os limites de tokens no seu sistema para obter respostas mais completas e detalhadas da IA.

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Limites Máximos por Modelo](#limites-máximos-por-modelo)
3. [Como Aumentar os Limites](#como-aumentar-os-limites)
4. [Arquivos que Precisam ser Atualizados](#arquivos-que-precisam-ser-atualizados)
5. [Considerações de Custo](#considerações-de-custo)
6. [Exemplos Práticos](#exemplos-práticos)

---

## 🎯 Visão Geral

Os limites de tokens controlam o tamanho máximo das respostas geradas pela IA. Atualmente, seu sistema usa limites conservadores (2000-4000 tokens) para controlar custos. Para respostas mais detalhadas, você pode aumentar esses limites.

**Arquivo de Configuração Centralizada**: `lib/ai/token-limits.ts` (criado para facilitar o gerenciamento)

---

## 📊 Limites Máximos por Modelo

### OpenAI
- **gpt-4o**: 16,384 tokens de saída ⭐ (recomendado para respostas muito longas)
- **gpt-4o-mini**: 16,384 tokens de saída ⭐
- **gpt-4-turbo**: 4,096 tokens de saída
- **gpt-3.5-turbo**: 4,096 tokens de saída

### Gemini
- **gemini-2.0-flash-exp**: 8,192 tokens de saída ⭐
- **gemini-1.5-pro**: 8,192 tokens de saída ⭐
- **gemini-1.5-flash**: 8,192 tokens de saída

### Grok
- **grok-beta**: 4,096 tokens de saída
- **grok-2**: 4,096 tokens de saída

---

## 🔧 Como Aumentar os Limites

### Opção 1: Usar Configuração Centralizada (Recomendado)

O arquivo `lib/ai/token-limits.ts` centraliza todas as configurações. Para aumentar um limite:

```typescript
// lib/ai/token-limits.ts
export const TOKEN_LIMITS = {
  improvement: {
    sectionAnalysis: 12000,  // Aumentado de 4000 para 12000
    documentAnalysis: 8000,   // Aumentado de 2000 para 8000
  },
  // ... outros limites
};
```

Depois, atualize os arquivos para usar essa configuração:

```typescript
import { getTokenLimit, validateTokenLimit } from '@/lib/ai/token-limits';

// No seu código:
const maxTokens = validateTokenLimit(model, getTokenLimit('improvement', 'sectionAnalysis'));
```

### Opção 2: Atualizar Manualmente em Cada Arquivo

Se preferir controle granular, edite diretamente os arquivos listados abaixo.

---

## 📁 Arquivos que Precisam ser Atualizados

### 1. **Análise de Melhorias** (`lib/improvement/section-analyzer.ts`)

**Linha 88** (OpenAI):
```typescript
max_tokens: 4000,  // Aumente para 8000-12000
```

**Linha 101** (Gemini):
```typescript
maxOutputTokens: 4000,  // Aumente para 8000-12000
```

### 2. **Análise Global de Documentos** (`lib/improvement/document-analyzer.ts`)

**Linha 252** (OpenAI):
```typescript
max_tokens: 2000,  // Aumente para 4000-8000
```

**Linha 265** (Gemini):
```typescript
maxOutputTokens: 2000,  // Aumente para 4000-8000
```

### 3. **Operações de Capítulo** (`lib/thesis/chapter-operations.ts`)

**Linha 1081** (OpenAI - Update):
```typescript
max_tokens: 4000,  // Aumente para 8000-12000
```

**Linha 1094** (Gemini - Update):
```typescript
// Adicione maxOutputTokens se não existir
maxOutputTokens: 8000,
```

### 4. **Chat Geral** (`lib/ai/openai.ts` e `lib/ai/gemini.ts`)

**lib/ai/openai.ts - Linha 29**:
```typescript
max_tokens: 2000,  // Aumente para 4000-8000
```

**lib/ai/gemini.ts - Linha 29**:
```typescript
maxOutputTokens: 2000,  // Aumente para 4000-8000
```

### 5. **Tradução** (`lib/translation/translate-direct.ts`)

O limite é passado como parâmetro `maxTokens`. Verifique onde essa função é chamada e aumente o valor passado.

### 6. **Adaptação** (`lib/adapt/processor.ts`)

**Linha 96** (OpenAI):
```typescript
// Adicione max_tokens se não existir
max_tokens: 8000,
```

**Linha 113** (Gemini):
```typescript
// Adicione maxOutputTokens se não existir
maxOutputTokens: 8000,
```

### 7. **Ajuste** (`lib/adjust/processor.ts`)

**Linha 98** (OpenAI):
```typescript
// Adicione max_tokens se não existir
max_tokens: 8000,
```

**Linha 111** (Gemini):
```typescript
// Adicione maxOutputTokens se não existir
maxOutputTokens: 8000,
```

---

## 💰 Considerações de Custo

### Impacto no Custo

Aumentar tokens aumenta o custo porque:
- **Tokens de saída são mais caros** que tokens de entrada
- Mais tokens = mais processamento = mais tempo = mais custo

### Estimativa de Custos (exemplo com GPT-4o)

| Limite de Tokens | Custo por 1000 respostas* | Tempo Médio |
|------------------|---------------------------|-------------|
| 2,000 tokens     | ~$2-5                     | 2-5 seg     |
| 4,000 tokens     | ~$4-10                    | 4-8 seg     |
| 8,000 tokens     | ~$8-20                    | 8-15 seg    |
| 16,000 tokens    | ~$16-40                   | 15-30 seg   |

*Valores aproximados, variam por modelo e região

### Recomendações

1. **Use limites altos apenas quando necessário**:
   - Análises detalhadas de documentos longos
   - Traduções de textos extensos
   - Geração de conteúdo complexo

2. **Use limites médios para operações rotineiras**:
   - Melhorias de seções individuais: 4000-8000 tokens
   - Chat geral: 2000-4000 tokens

3. **Monitore o uso**:
   - Acompanhe custos no dashboard da OpenAI/Gemini
   - Ajuste limites conforme necessário

---

## 💡 Exemplos Práticos

### Exemplo 1: Aumentar Limite para Análise de Seções

**Antes** (`lib/improvement/section-analyzer.ts`):
```typescript
max_tokens: 4000,
```

**Depois**:
```typescript
max_tokens: 12000,  // 3x mais detalhado
```

### Exemplo 2: Aumentar Limite para Chat Detalhado

**Antes** (`lib/ai/openai.ts`):
```typescript
max_tokens: 2000,
```

**Depois**:
```typescript
max_tokens: 8000,  // 4x mais detalhado
```

### Exemplo 3: Usar Configuração Centralizada

```typescript
// lib/improvement/section-analyzer.ts
import { getTokenLimit, validateTokenLimit } from '@/lib/ai/token-limits';

// No código:
const maxTokens = validateTokenLimit(model, getTokenLimit('improvement', 'sectionAnalysis'));

const completion = await openai.chat.completions.create({
  model,
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_tokens: maxTokens,  // Usa o valor configurado
  response_format: { type: 'json_object' }
});
```

---

## ⚠️ Avisos Importantes

1. **Não exceda os limites máximos do modelo** - Use `validateTokenLimit()` para garantir
2. **Teste incrementalmente** - Aumente gradualmente e teste
3. **Monitore custos** - Tokens altos podem aumentar significativamente os custos
4. **Considere o tempo de resposta** - Mais tokens = respostas mais lentas

---

## 🚀 Próximos Passos

1. Decida quais operações precisam de mais tokens
2. Atualize os limites nos arquivos correspondentes
3. Teste com documentos reais
4. Monitore custos e performance
5. Ajuste conforme necessário

---

## 📞 Suporte

Se tiver dúvidas sobre limites específicos ou precisar de ajuda para implementar, consulte:
- Documentação OpenAI: https://platform.openai.com/docs/models
- Documentação Gemini: https://ai.google.dev/models/gemini
- Arquivo de configuração: `lib/ai/token-limits.ts`
