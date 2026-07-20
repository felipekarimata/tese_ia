# Deploy no Railway

## Passos para Deploy

### 1. Preparar o Repositório Git

```bash
# Se ainda não iniciou git
git init
git add .
git commit -m "Initial commit - AutorIA MVP"

# Criar repositório no GitHub e fazer push
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git branch -M main
git push -u origin main
```

### 2. Deploy no Railway

1. Acesse [railway.app](https://railway.app)
2. Faça login com GitHub
3. Clique em "New Project"
4. Selecione "Deploy from GitHub repo"
5. Escolha o repositório do projeto
6. Railway detectará automaticamente Next.js

### 3. Configurar Variáveis de Ambiente

No painel do Railway, vá em **Variables** e adicione:

```env
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=AIza...
XAI_API_KEY=xai-...
NODE_ENV=production
```

⚠️ **IMPORTANTE**: Use chaves novas! As chaves no .env.local foram expostas.

### 4. Deploy Automático

- Railway fará build e deploy automaticamente
- A cada push no GitHub, redeploy automático
- URL pública será gerada (ex: `autoria-mvp.up.railway.app`)

## Verificar Deploy

Após deploy, acesse:
- `https://SEU-APP.up.railway.app` - Página inicial
- `https://SEU-APP.up.railway.app/settings` - Configurações

## Logs e Monitoramento

- Railway Dashboard → Aba "Deployments"
- Ver logs em tempo real
- Métricas de uso e performance

## ⚠️ Limitações do Tier Grátis

- $5 de crédito/mês grátis
- Após isso, ~$5-10/mês dependendo do uso
- Estado em memória persiste enquanto app não reiniciar

## Alternativa: Deploy Manual via CLI

```bash
# Instalar Railway CLI
npm i -g @railway/cli

# Login
railway login

# Inicializar projeto
railway init

# Deploy
railway up

# Ver logs
railway logs
```
