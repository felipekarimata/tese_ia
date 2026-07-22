# 🏗️ Arquitetura Técnica - AutorIA MVP

## Visão Geral

Sistema RAG (Retrieval-Augmented Generation) local para chat sobre documentos com múltiplas IAs.

```
┌─────────────┐
│   Next.js   │ ← Framework (App Router)
│   (React)   │
└─────┬───────┘
      │
      ├─ Pages (Client Components)
      │  ├─ / (Dashboard)
      │  ├─ /documents/[id] (Chat)
      │  └─ /settings (Config)
      │
      ├─ API Routes (Server)
      │  ├─ /api/upload
      │  ├─ /api/ingest
      │  ├─ /api/chat
      │  ├─ /api/export
      │  ├─ /api/documents
      │  └─ /api/settings
      │
      └─ Lib (Business Logic)
         ├─ state.ts (In-Memory Store)
         ├─ parsers.ts (PDF/DOCX/TXT)
         ├─ chunking.ts (Text Splitting)
         └─ ai/ (IA Integrations)
            ├─ openai.ts
            ├─ gemini.ts
            ├─ grok.ts
            ├─ executor.ts
            └─ prompts.ts
```

## 📊 Fluxo de Dados

### 1. Upload & Ingest

```
Client                API              Parser            Chunker          State
  │                   │                 │                  │                │
  ├─ Upload File ────→│                 │                  │                │
  │                   ├─ Save to /tmp ─→│                 │                │
  │                   │                 ├─ Extract Text ─→│                │
  │                   │                 │                  ├─ Split Text ─→│
  │                   │                 │                  │  (overlap)    │
  │                   │                 │                  │                ├─ Build Index
  │                   │                 │                  │                │  (BM25)
  │                   │                 │                  │                │
  │←─ {documentId} ───┤←────────────────┤←─────────────────┤←───────────────┤
```

### 2. Chat (RAG)

```
Client              API              State              AI Provider
  │                  │                 │                     │
  ├─ Ask Question ──→│                 │                     │
  │                  ├─ Search Index ─→│                     │
  │                  │←─ Top 8 Chunks ─┤                     │
  │                  ├─ Build Prompt ──┼────────────────────→│
  │                  │                 │  (system + user)    │
  │                  │                 │                     ├─ Generate
  │                  │                 │                     │  (streaming)
  │                  │←────────────────┼─────────────────────┤
  │                  ├─ Extract Citations                    │
  │                  ├─ Calculate Metrics                    │
  │←─ Answer ────────┤                                       │
     + Citations
     + Metrics
```

### 3. Multi-IA Compare

```
Client                     API                 AI Providers
  │                         │                   │ │ │
  ├─ Toggle "Run All 3" ───→│                   │ │ │
  │                         ├─ Promise.all([    │ │ │
  │                         │   executeOpenAI ──→│ │
  │                         │   executeGemini ───→ │
  │                         │   executeGrok ──────→
  │                         │ ])                │ │ │
  │                         │←──────────────────┤ │ │
  │←─ [Answer1,2,3] ────────┤                   │ │ │
     (side-by-side)
```

## 🧩 Componentes Principais

### Backend (API Routes)

| Route | Método | Função | Runtime |
|-------|--------|--------|---------|
| `/api/upload` | POST | Upload de arquivo multipart | Node.js |
| `/api/ingest` | POST | Parsing + Chunking + Indexação | Node.js |
| `/api/chat` | POST | RAG query com IA(s) | Node.js |
| `/api/export` | POST | Gera DOCX com resposta | Node.js |
| `/api/documents` | GET | Lista documentos | Node.js |
| `/api/documents/[id]` | GET | Metadados de um doc | Node.js |
| `/api/settings` | GET/POST | Config de chaves e modelos | Node.js |
| `/api/settings/test` | POST | Testa conexão com IA | Node.js |

### Frontend (Pages)

| Page | Descrição |
|------|-----------|
| `/` | Dashboard com lista de docs |
| `/documents/[id]` | Chat RAG sobre doc |
| `/settings` | Config de API keys |

### State Management

```typescript
// lib/state.ts
export const state = {
  docs: Map<string, InMemoryDoc>,
  settings: {
    openaiKey: string,
    googleKey: string,
    xaiKey: string,
    models: { ... },
    pricesUSD: { ... }
  }
}
```

**Singleton em memória** - não persiste entre restarts.

## 🔍 Algoritmo de RAG

### Indexação (BM25 via elasticlunr)

```typescript
// lib/state.ts
buildIndex(chunks) {
  index = elasticlunr()
  index.addField('text')
  index.setRef('ix')

  chunks.forEach(chunk => {
    index.addDoc({
      ix: chunk.ix,
      text: chunk.text,
      pageFrom: chunk.pageFrom,
      pageTo: chunk.pageTo
    })
  })

  return index
}
```

### Busca

```typescript
searchIndex(index, query, topK=8) {
  results = index.search(query)
  return results.slice(0, topK)
}
```

### Chunking

```typescript
// lib/chunking.ts
chunkText(text, totalPages) {
  chunks = []
  currentPos = 0

  while (currentPos < text.length) {
    endPos = min(currentPos + maxSize, text.length)

    // Quebra em newline ou espaço
    if (endPos < text.length) {
      endPos = lastIndexOf('\n' or ' ')
    }

    chunk = text[currentPos:endPos]
    chunks.push({
      ix: chunkIndex++,
      pageFrom: estimatePage(currentPos),
      pageTo: estimatePage(endPos),
      text: chunk
    })

    currentPos = endPos - overlap
  }

  return chunks
}
```

**Parâmetros:**
- minSize: 900 chars
- maxSize: 1200 chars
- overlap: 200 chars

## 🤖 Integração com IAs

### Arquitetura

```
ai/executor.ts
    ↓
    ├─→ ai/openai.ts  → OpenAI SDK
    ├─→ ai/gemini.ts  → @google/generative-ai
    └─→ ai/grok.ts    → fetch (REST API)
```

### Prompts

**System Prompt:**
```
Você é um assistente técnico/editorial.
Responda apenas com base nos trechos fornecidos.

Regras:
1. Se faltar base, diga: 'informação insuficiente'
2. Inclua citações com página
3. Entregue: resumo + resposta final
```

**User Prompt:**
```
PERGUNTA:
{question}

CONTEXTO:
[Página: X-Y, §Z]
{chunk1}

[Página: A-B, §C]
{chunk2}
...
```

### Retry & Error Handling

- Cada executor tenta **2x** com 1s de delay
- Erros retornam como resposta com `❌ Erro: {message}`
- Não interrompem execução paralela

### Métricas

```typescript
{
  latencyMs: Date.now() - startTime,
  tokensIn: usage.prompt_tokens || chars/4,
  tokensOut: usage.completion_tokens || chars/4,
  costEstimatedUsd: (tokensIn/1000)*priceIn + (tokensOut/1000)*priceOut
}
```

## 📦 Parsers

| Formato | Lib | Output |
|---------|-----|--------|
| PDF | `pdf-parse` | text + numpages |
| DOCX | `mammoth` | text (estimativa de páginas) |
| TXT | `fs` | text (estimativa de páginas) |

**Estimativa de páginas:** ~500 palavras/página

## 📝 Export DOCX

```typescript
// lib exports via docx package
Document({
  sections: [
    { children: [
        Paragraph(title),
        ...Paragraph(answer lines)
      ]
    }
  ],
  footnotes: {
    1: "Página X, §Y-Z",
    ...
  }
})
```

## 🎨 UI Components (shadcn/ui)

- **Button**: Ações principais
- **Card**: Containers de conteúdo
- **Input/Textarea**: Formulários
- **Select**: Dropdowns
- **Tabs**: Navegação de ações
- **Badge**: Tags e status
- **Dialog**: Modal de upload
- **Label**: Labels de formulário

**Toast**: `sonner` para notificações

## 🔒 Segurança

### ⚠️ Limitações Atuais (MVP)

- ❌ Chaves **não criptografadas** (plain text na memória)
- ❌ Sem autenticação/autorização
- ❌ Sem rate limiting
- ❌ Sem validação de tamanho de arquivo
- ❌ Sem sanitização de inputs
- ❌ Uploads em `/tmp` sem cleanup automático

### ✅ Para Produção (TODO)

- Criptografia de chaves (AES-256)
- Autenticação (NextAuth.js)
- Rate limiting (Upstash)
- Validação de uploads (max 10MB)
- Sanitização de markdown
- Cleanup de arquivos temporários
- HTTPS obrigatório

## 🚀 Performance

### Otimizações Atuais

- ✅ Busca BM25 (O(log n))
- ✅ Chunking com overlap
- ✅ Execução paralela de IAs
- ✅ Streaming de responses (client)

### Bottlenecks

- ⏱️ Parsing de PDFs grandes (sincrono)
- ⏱️ Indexação completa em cada ingest
- ⏱️ Sem cache de embeddings
- ⏱️ Estado em memória (não escalável)

### Melhorias Futuras

- Parsing assíncrono com workers
- Incremental indexing
- Cache de embeddings em Redis
- Persistência em PostgreSQL/Supabase
- Vector search (pgvector)

## 📊 Estimativa de Capacidade

**Configuração Atual (Memória):**

- ~50 documentos simultâneos
- ~100 páginas por documento
- ~10 chunks por página
- = 50K chunks em memória (~50MB)

**Limite prático:** ~10 usuários locais simultâneos

## 🔄 Ciclo de Vida

```
START SERVER
    ↓
[State Singleton Init]
    ├─ docs = new Map()
    └─ settings = { keys, models, prices }
    ↓
[User Actions]
    ├─ Upload → Ingest → Index
    ├─ Chat → Search → AI → Response
    └─ Export → DOCX
    ↓
RESTART SERVER
    ↓
[State Lost] ⚠️
```

## 📚 Dependências Principais

| Package | Uso |
|---------|-----|
| `next@15` | Framework |
| `react@18` | UI |
| `openai` | OpenAI SDK |
| `@google/generative-ai` | Gemini SDK |
| `elasticlunr` | BM25 search |
| `pdf-parse` | PDF parsing |
| `mammoth` | DOCX parsing |
| `docx` | DOCX export |
| `formidable` | File uploads |
| `tailwindcss` | Styling |
| `@radix-ui/*` | UI primitives |

## 🎯 Trade-offs de Design

| Decisão | Pro | Contra |
|---------|-----|--------|
| In-memory state | Simples, rápido | Não persiste |
| BM25 (não embeddings) | Sem custo de embedding | Menos semântico |
| Chunking fixo | Simples | Pode quebrar contexto |
| No auth | Rápido p/ MVP | Não seguro |
| Monolito Next.js | Deploy simples | Não escala |

---

**Versão:** MVP 1.0
**Data:** 2025-01
**Status:** Funcional para testes locais
