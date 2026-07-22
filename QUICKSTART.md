# 🚀 Início Rápido - AutorIA MVP

## Passos para Começar

### 1. Configure as Chaves de API (Opcional)

Você pode configurar as chaves de duas formas:

**Opção A:** Via arquivo `.env.local` (recomendado)
```bash
# Copie o exemplo
cp .env.local.example .env.local

# Edite e adicione suas chaves
# OPENAI_API_KEY=sk-...
# GOOGLE_API_KEY=AIza...
# XAI_API_KEY=xai-...
```

**Opção B:** Via interface web em http://localhost:3000/settings

### 2. Inicie o Servidor

```bash
npm run dev
```

O servidor estará disponível em: **http://localhost:3000**

### 3. Teste o Sistema

1. **Acesse as Configurações** (http://localhost:3000/settings)
   - Configure suas chaves de API
   - Teste a conexão com cada provedor

2. **Volte ao Dashboard** (http://localhost:3000)
   - Clique em "Novo Upload"
   - Envie um documento (PDF, DOCX ou TXT)

3. **Abra o Documento**
   - Clique no card do documento
   - Digite uma pergunta
   - Escolha o provedor e modelo
   - Ou ative "Rodar 3 IAs" para comparar

4. **Explore as Funcionalidades**
   - Use as abas: Chat, Traduzir, Melhorias, Adaptar, Atualizar
   - Veja citações, latência e custos
   - Exporte respostas para DOCX

## 🎯 Exemplo de Teste Rápido

1. Faça upload de um artigo ou documento
2. Pergunta: "Quais são os principais tópicos abordados?"
3. Ative "Rodar 3 IAs"
4. Compare as respostas lado-a-lado!

## ⚠️ Lembretes

- **Dados em memória**: Reiniciar o servidor apaga tudo
- **Não seguro**: Use apenas localmente para testes
- **Modelos suportados**:
  - OpenAI: gpt-4o-mini, gpt-4o
  - Gemini: gemini-1.5-pro, gemini-1.5-flash
  - Grok: grok-2, grok-2-mini

## 🔧 Comandos Úteis

```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Executar produção
npm start

# Lint
npm run lint
```

## 📊 Métricas Exibidas

Para cada resposta você verá:
- ✅ Texto da resposta (markdown)
- 📄 Citações com páginas
- ⏱️ Latência (ms)
- 🔢 Tokens (input/output)
- 💰 Custo estimado (USD)

## 🎨 Ações Especiais

- **Chat**: Pergunta livre sobre o documento
- **Traduzir**: PT-BR ↔ EN com citações
- **Melhorias**: Sugestões de clareza/concisão
- **Adaptar**: Reestruturação em seções lógicas
- **Atualizar**: Identificar trechos desatualizados

---

**Pronto!** Você está pronto para usar o AutorIA MVP! 🎉
