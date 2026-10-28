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

## Keep-alive do Supabase (evitar hibernação)

Projetos Supabase no plano free hibernam após ~7 dias sem atividade. Para evitar
isso, existe o endpoint:

```
GET /api/cron/keepalive
```

Ele faz uma leitura mínima no banco (equivalente a `SELECT 1`) e retorna
`{ "status": "ok" }`.

### Como configurar (Coolify ou similar)

1. Crie um **Scheduled Task / Cron** no Coolify (ou use um serviço externo como
   cron-job.org / UptimeRobot) chamando a URL pública:
   ```
   https://SEU-APP/api/cron/keepalive
   ```
2. Frequência sugerida: **a cada 24h** (basta manter atividade dentro da janela
   de hibernação).
3. (Opcional, recomendado) Defina a env `CRON_SECRET` e configure o agendador
   para enviar o header `Authorization: Bearer <CRON_SECRET>` (ou `?secret=...`).
   Sem `CRON_SECRET`, o endpoint é aberto (apenas uma leitura trivial).

> O endpoint está liberado no middleware (`/api/cron` é público), então não exige
> login.

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
