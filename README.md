# AutorIA MVP

Sistema de chat sobre documentos com múltiplas IAs (OpenAI, Gemini, Grok).

## ⚠️ Avisos Importantes de Segurança

### 🔓 Banco de Dados - Apenas para Testes (V1)

**ATENÇÃO:** Este projeto está em **fase de validação da V1** e o banco de dados Supabase está configurado com **permissões totalmente abertas** para facilitar o desenvolvimento e testes.

⚠️ **RISCOS:**
- Qualquer usuário pode ler, inserir, modificar e deletar dados
- Não há autenticação ou validação de usuários
- Dados sensíveis podem ser expostos
- Adequado **APENAS** para ambiente de desenvolvimento/testes

🔒 **Antes de ir para produção:**
- Implementar Row Level Security (RLS) no Supabase
- Adicionar autenticação de usuários
- Configurar políticas de acesso granulares
- Validar todas as operações no backend
- Criptografar dados sensíveis

### 💾 Armazenamento Temporário

Este é um **MVP** para testes. Alguns dados ainda podem ser armazenados **apenas na memória** do servidor. Quando o servidor é reiniciado, **esses dados podem ser perdidos**.

As chaves de API **não são criptografadas** e ficam apenas na memória. Use apenas para testes locais.

## 🚀 Funcionalidades

- ✅ Upload de documentos (PDF, DOCX, TXT)
- ✅ Processamento automático com chunking e indexação (BM25)
- ✅ Chat sobre documentos com contexto (RAG)
- ✅ Suporte a 3 provedores de IA:
  - OpenAI (GPT-4o, GPT-4o-mini)
  - Google Gemini (2.5 Pro, 2.5 Flash, 2.0 Flash)
  - xAI Grok (Grok-2-1212, Grok-2-Vision-1212)
- ✅ Comparação lado-a-lado das respostas
- ✅ Citações automáticas com página
- ✅ Métricas de latência, tokens e custo estimado
- ✅ Ações especiais:
  - Tradução PT-BR ↔ EN
  - Sugestões de melhorias
  - Adaptação/reestruturação
  - Verificação de desatualização
- ✅ Exportação de respostas para DOCX

## 📋 Pré-requisitos

- Node.js 18+
- npm ou yarn

## 🔧 Instalação

1. Clone ou baixe o projeto

2. Instale as dependências:
```bash
npm install
```

3. (Opcional) Configure as chaves de API no arquivo `.env.local`:
```bash
cp .env.local.example .env.local
```

Edite `.env.local` e adicione suas chaves:
```
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
XAI_API_KEY=xai-...
```

**Nota:** Você também pode configurar as chaves pela interface em `/settings`.

## 🏃 Como Usar

1. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

2. Abra o navegador em: http://localhost:3000

3. Configure as chaves de API em **Configurações** (caso não tenha criado o `.env.local`)

4. Faça upload de um documento (PDF, DOCX ou TXT)

5. Clique no documento para abrir a página de chat

6. Faça perguntas sobre o documento!

## 📁 Estrutura do Projeto

```
.
├── app/
│   ├── api/              # API Routes (Next.js)
│   │   ├── upload/       # Upload de arquivos
│   │   ├── ingest/       # Processamento de documentos
│   │   ├── chat/         # Consultas com IA
│   │   ├── export/       # Exportação DOCX
│   │   ├── documents/    # Listagem de documentos
│   │   └── settings/     # Configurações
│   ├── documents/[id]/   # Página de chat sobre documento
│   ├── settings/         # Página de configurações
│   └── page.tsx          # Dashboard principal
├── components/           # Componentes React
│   ├── ui/              # Componentes shadcn/ui
│   ├── upload-dialog.tsx
│   └── answer-compare-grid.tsx
├── lib/
│   ├── state.ts         # Estado em memória (singleton)
│   ├── chunking.ts      # Chunking de documentos
│   ├── parsers.ts       # Parsers (PDF/DOCX/TXT)
│   └── ai/              # Integrações com IAs
│       ├── openai.ts
│       ├── gemini.ts
│       ├── grok.ts
│       ├── executor.ts
│       ├── prompts.ts
│       └── types.ts
└── README.md
```

## 🎯 Uso Típico

### 1. Upload e Processamento
```
Upload → Parsing → Chunking → Indexação (BM25)
```

### 2. Chat RAG
```
Pergunta → Busca no Índice → Top 8 Chunks →
Prompt com Contexto → IA → Resposta + Citações
```

### 3. Comparação Multi-IA
```
Ativa "Rodar 3 IAs" →
Executa OpenAI + Gemini + Grok em paralelo →
Compara respostas lado-a-lado
```

## 🔑 Obtendo Chaves de API

- **OpenAI**: https://platform.openai.com/api-keys
- **Google Gemini**: https://aistudio.google.com/app/apikey
- **xAI Grok**: https://console.x.ai

## 💡 Dicas

- Use documentos de até ~50 páginas para melhor performance
- O chunking é configurado para 900-1200 caracteres com overlap de 200
- A busca retorna os top 8 chunks mais relevantes
- As citações são extraídas automaticamente do texto da resposta

## 🛠️ Build para Produção

```bash
npm run build
npm start
```

**Atenção:** Lembre-se que os dados ainda ficarão apenas na memória!

## 🚀 Deploy no Railway

Este projeto está configurado para deploy fácil no Railway. Veja instruções detalhadas em [DEPLOY.md](./DEPLOY.md).

**Passos rápidos:**

1. Criar repositório Git e fazer push para GitHub
2. Conectar no [Railway](https://railway.app)
3. Deploy automático do repositório
4. Adicionar variáveis de ambiente (OPENAI_API_KEY, GOOGLE_API_KEY, XAI_API_KEY)
5. Sua aplicação estará online!

**Vantagens do Railway:**
- Estado em memória persiste (servidor Node.js, não serverless)
- Deploy automático a cada push
- $5 crédito grátis/mês
- SSL e domínio incluídos

## 📝 Próximos Passos (Evolução)

Para transformar em produção:
1. Substituir estado em memória por SQLite local
2. Adicionar persistência em banco (Supabase/PostgreSQL)
3. Criptografar chaves de API
4. Adicionar autenticação
5. Implementar cache de embeddings
6. Melhorar chunking com detecção de estrutura

## 📄 Licença

MIT - Livre para uso e modificação
