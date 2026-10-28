# DIAGNÓSTICO — Tese-IA / AutorIA

> Relatório de mapeamento para 3 melhorias: **Esqueci minha senha**, **Login Microsoft 365** e **Review de UX**.
> **Nada foi implementado.** Este arquivo é só o levantamento + planos para você aprovar.
> Data: 2026-10-28 · Branch: `main`

---

## ⚠️ ACHADO CRÍTICO QUE MUDA TUDO (ler antes das Partes 2 e 3)

O enunciado assume *"mantém NextAuth + bcrypt, usuários numa tabela"*. **Isso não existe hoje.** A realidade:

- A autenticação inteira vive num **`Map` em memória** dentro de [auth.ts](auth.ts) (linha 5).
- Há um **admin hardcoded** com senha em **texto puro**: `admin@tese.com` / `Alterar@01` ([auth.ts:8-13](auth.ts#L8-L13)).
- `bcryptjs` **está no `package.json` mas NUNCA é importado/usado** em lugar nenhum do código (grep confirmou 0 ocorrências).
- Senhas são comparadas com `user.password !== password` — **comparação de string em texto puro** ([auth.ts:54](auth.ts#L54)).
- **Não existe tabela de usuários** no Supabase. Nenhuma migration cria `users`. Nenhum campo `reset_token`, `verified_email`, etc.
- Usuários criados no "signup" moram só na RAM do processo → **somem a cada restart/redeploy** e **não são compartilhados entre réplicas** (e o deploy roda em Docker/Coolify — ver [DEPLOY.md](DEPLOY.md)).

**Consequência prática:** as Partes 2 e 3 são **impossíveis sobre a base atual**. Não dá pra resetar a senha de um usuário que não está em banco nenhum, nem "fazer merge por email" com uma tabela que não existe.

👉 **Pré-requisito obrigatório (Parte 0):** migrar a auth do `Map` em memória para uma tabela `users` real no Supabase, com `bcrypt` de verdade. Só depois disso as Partes 2 e 3 fazem sentido. Detalho abaixo.

---

## PARTE 1 — Mapeamento da Auth atual

| Pergunta | Resposta |
|---|---|
| **Provider NextAuth** | Apenas **Credentials** (`next-auth/providers/credentials`). Nenhum OAuth. Versão: `next-auth@5.0.0-beta.29` (v5 beta) + `@auth/core@0.41.1`. |
| **Onde ficam os usuários** | **Em memória** (`const users = new Map(...)` em [auth.ts:5](auth.ts#L5)). **Não há tabela no Supabase.** O schema ([supabase-schema.sql](supabase-schema.sql)) só tem `projects`, `documents`, `translation_jobs`, `settings` — nada de `users`. |
| **Hash de senha** | **Nenhum.** Senha guardada em texto puro e comparada com `!==` ([auth.ts:54](auth.ts#L54)). O comentário `// In production, hash this!` ([auth.ts:41](auth.ts#L41)) admite isso. `bcryptjs` instalado mas ocioso. |
| **Sessão** | **JWT** (default do NextAuth com Credentials — não há adapter de banco, logo sessão de banco é impossível aqui). Callbacks `jwt` e `session` propagam `token.sub` → `session.user.id` ([auth.ts:69-82](auth.ts#L69-L82)). Cookie de sessão padrão do NextAuth. |
| **Campos tipo `reset_token` / `verified_email`** | **Não existem.** Objeto de usuário só tem `{ id, name, email, password }`. |

**Outros pontos relevantes da auth:**
- [middleware.ts](middleware.ts) protege tudo por default; rotas públicas: `/login`, `/api/auth`, `/api/health`. Redireciona não-logado → `/login` e logado em `/login` → `/`.
- A rota [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts) só reexporta `handlers`.
- Signup e login compartilham o mesmo `authorize()` via campo `action` ("signup"|"login") vindo do form ([auth.ts:24-63](auth.ts#L24-L63)).
- `AUTH_SECRET` é a env de auth ([.env.local.example](.env.local.example)).
- **RLS do Supabase está "liberado pra tudo"** (`USING (true)`) — ver [supabase-schema.sql:131-135](supabase-schema.sql#L131-L135). Não há isolamento por usuário em nenhuma tabela (projetos/documentos/teses são globais e compartilhados entre todos os logins).

---

## PARTE 0 (PRÉ-REQUISITO) — Migrar auth para tabela real + bcrypt

Sem isto, Partes 2 e 3 não têm onde se apoiar. Proposta mínima:

**SQL — tabela `users`:**
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                      -- null p/ usuários só-OAuth (Microsoft)
  email_verified TIMESTAMPTZ,             -- preparado p/ verificação futura
  provider      TEXT NOT NULL DEFAULT 'credentials', -- 'credentials' | 'microsoft-entra-id'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_email ON public.users (lower(email));
```
> Observação: o acesso é via **service role key no servidor** (padrão do projeto, ver [lib/supabase.ts](lib/supabase.ts)). Como o Next.js é o único que escreve, dá pra manter RLS restritivo e acessar só pelo backend. Confirmar se quer endurecer RLS agora ou depois.

**Mudanças em [auth.ts](auth.ts):**
- Remover o `Map` e o admin hardcoded.
- No `authorize()`: buscar usuário por email no Supabase; comparar com `bcrypt.compare(password, user.password_hash)`.
- No "signup": `bcrypt.hash(password, 12)` e `insert` na tabela.
- Seed do admin: inserir via SQL com hash gerado (não em código).

**Esforço:** ~meio dia. É a fundação das outras duas features.

---

## PARTE 2 — Plano "Esqueci minha senha"

Arquitetura confirmada: fluxo custom em Next.js, mantém NextAuth + bcrypt, email via SMTP do Brevo. **Depende da Parte 0.**

**SQL — nova tabela:**
```sql
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,              -- guardar o HASH do token, nunca o token cru
  expires_at TIMESTAMPTZ NOT NULL,       -- now() + interval '1 hour'
  used_at    TIMESTAMPTZ,               -- marca uso único
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_prt_token_hash ON public.password_reset_tokens (token_hash);
CREATE INDEX idx_prt_user_id    ON public.password_reset_tokens (user_id);
```
> Segurança: gere o token com `crypto.randomBytes(32).toString('hex')`, mande o token **cru no link do email**, mas salve só `sha256(token)` na coluna `token_hash`. Assim, vazamento do banco não permite resetar senhas.

**Arquivos a criar:**
| Arquivo | Papel |
|---|---|
| `app/(auth)/esqueci-senha/page.tsx` | Form que pede email |
| `app/(auth)/resetar-senha/page.tsx` | Form de nova senha (lê `?token=` da URL) |
| `app/api/auth/forgot-password/route.ts` | Gera token, salva hash, dispara email |
| `app/api/auth/reset-password/route.ts` | Valida token (existe, não expirou, não usado), troca senha, marca `used_at` |
| `lib/email/mailer.ts` | Wrapper nodemailer com SMTP do Brevo |
| `lib/email/templates.ts` | HTML do email de reset |

> Precisa adicionar **`nodemailer`** às deps (`npm i nodemailer` + `@types/nodemailer`).

**Snippet de envio (nodemailer + Brevo):**
```ts
// lib/email/mailer.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_SMTP_HOST,      // smtp-relay.brevo.com
  port: Number(process.env.BREVO_SMTP_PORT ?? 587),
  secure: false,                          // STARTTLS na 587
  auth: {
    user: process.env.BREVO_SMTP_USER,    // login SMTP do Brevo
    pass: process.env.BREVO_SMTP_PASS,    // chave SMTP (não a senha da conta)
  },
});

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,         // ex: "AutorIA <no-reply@seudominio.com>"
    to,
    subject: 'Redefinição de senha — AutorIA',
    html: `<p>Você pediu para redefinir sua senha.</p>
           <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a> (expira em 1 hora).</p>
           <p>Se não foi você, ignore este email.</p>`,
  });
}
```
> O enunciado menciona "SMTP do Brevo configurado no Supabase SMTP Settings". Atenção: o SMTP do Supabase só é usado pelo **Supabase Auth**. Como aqui o fluxo é custom (NextAuth), o Next.js precisa das **próprias credenciais SMTP do Brevo** nas env vars acima — não dá pra "reaproveitar" o que está no painel do Supabase.

**Novas env vars:** `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`, `EMAIL_FROM`, `APP_URL` (já existe).

**Integração com o fluxo existente:**
- Link **"Esqueci minha senha"** na [página de login](app/(auth)/login/page.tsx) (hoje não existe).
- `forgot-password` deve **sempre responder 200** ("se o email existir, enviamos o link"), mesmo se o email não existir — evita enumeração de usuários.
- Após reset bem-sucedido, redirecionar para `/login` com toast de sucesso.
- Rate limit básico (1 pedido por email a cada X min) — nice-to-have.

---

## PARTE 3 — Plano Login Microsoft 365

Referência TAXOS usa `@azure/msal-node` (single-tenant). **Aqui o certo é o provider nativo do NextAuth v5** — não use MSAL. **Depende da Parte 0.**

**Atenção ao nome das env vars:** o enunciado cita `AZURE_AD_*` (nomenclatura antiga do `next-auth@4`). No **NextAuth v5** o provider é `microsoft-entra-id` e as envs são auto-descobertas com outro padrão:

| Env var (NextAuth v5) | Equivalente que você citou | Onde obter |
|---|---|---|
| `AUTH_MICROSOFT_ENTRA_ID_ID` | `AZURE_AD_CLIENT_ID` | App registration → Application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | `AZURE_AD_CLIENT_SECRET` | App registration → Certificates & secrets |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | derivado do `AZURE_AD_TENANT_ID` | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` |

**Código do provider (adicionar em [auth.ts](auth.ts)):**
```ts
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

providers: [
  Credentials({ /* ...o existente... */ }),
  MicrosoftEntraID({
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
    issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!, // single-tenant
    authorization: { params: { scope: "openid profile email" } },
  }),
],
```

**Mapeamento Microsoft → tabela `users` (merge por email):** usar o callback `signIn` para fazer upsert.
```ts
callbacks: {
  async signIn({ user, account }) {
    if (account?.provider === "microsoft-entra-id") {
      // merge por email: se existe, loga; se não, cria usuário sem senha
      await upsertUserByEmail({
        email: user.email!,
        name: user.name,
        provider: "microsoft-entra-id",
      });
    }
    return true;
  },
  async jwt({ token, user }) {
    // resolver token.sub para o id da tabela users (por email), não o id do Entra
    ...
  },
  // session: igual ao atual
}
```
**Decisão de produto a confirmar:** *criar automaticamente* quem logar com Microsoft, ou *só permitir emails já cadastrados* (allowlist por domínio, ex. `@empresa.com`)? Recomendo **allowlist por domínio corporativo** para não abrir cadastro a qualquer conta Microsoft.

> Nota técnica: como a sessão é **JWT puro** (sem adapter), o "merge" não é automático — é preciso fazer o upsert no callback `signIn` e resolver o `id` da sua tabela no callback `jwt`. Sem isso, o `session.user.id` seria o `oid` do Entra, não o `users.id`, e quebraria qualquer vínculo futuro (ex. autoria de projetos).

**Checklist do Jorge no Entra ID (Azure Portal → App registrations):**
1. **New registration** (single-tenant, "Accounts in this organizational directory only").
2. **Redirect URI** (tipo *Web*):
   - Produção: `https://<SEU_DOMINIO>/api/auth/callback/microsoft-entra-id`
   - Dev: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
3. **Certificates & secrets** → gerar client secret → anotar o *Value* (some depois).
4. **API permissions** → Microsoft Graph → delegated: `openid`, `profile`, `email`, `User.Read` → *Grant admin consent*.
5. Enviar: **Client ID**, **Client secret**, **Tenant ID** (Directory ID).

---

## PARTE 4 — Review de UX

Base: tema é **100% dark forçado** (`<html className="dark">` em [app/layout.tsx:20](app/layout.tsx#L20), `<Toaster theme="dark">`). Visual coeso (glassmorphism, vermelho/preto). Pontos:

### 🔴 CRÍTICO
1. **Signup cria usuário só em memória** ([auth.ts:30-50](auth.ts#L30-L50)). O usuário vê "Conta criada com sucesso!" e, no próximo redeploy/restart (ou em outra réplica do Docker), **não consegue mais logar**. Quebra de confiança total. → resolvido pela Parte 0.
2. **Não há "Esqueci minha senha"** na [tela de login](app/(auth)/login/page.tsx). Usuário que esquece a senha fica **travado sem saída** (só o admin hardcoded entra). → Parte 2.
3. **Botão de excluir (lixeira) só aparece no hover** ([page.tsx:386](app/(main)/page.tsx#L386), `opacity-0 group-hover:opacity-100`). Em **touch/mobile não há hover** → função de excluir fica **inacessível no celular**. Também é `<button>` só com ícone e `title` (sem `aria-label`).

### 🟡 IMPORTANTE
4. **Mensagens de erro de login são genéricas e podem nem aparecer.** No NextAuth v5 beta, os erros lançados em `authorize()` (ex. `"Email já cadastrado"`) frequentemente chegam ao cliente como `"CredentialsSignin"` genérico, não como a mensagem real — então o `toast.error(result.error)` ([login/page.tsx:35](app/(auth)/login/page.tsx#L35)) pode mostrar texto técnico. Validar o comportamento real e tratar os códigos de erro.
5. **Sem validação inline de formulário.** Tudo é `toast` (login, novo projeto). Não há feedback embaixo do campo (ex. "email inválido", "senha mínima de 8 caracteres"). Login nem exige tamanho mínimo de senha.
6. **Confirmação de exclusão via `window.confirm`** ([page.tsx:330](app/(main)/page.tsx#L330)). Funciona, mas destoa do design (dialog nativo do browser) e não é estilizável. Trocar por um `AlertDialog` do Radix seria mais coeso.
7. **Classes `dark:` espalhadas e mortas.** Como o app é sempre dark, variantes `dark:` em 6 componentes (ex. [pipeline-wizard.tsx](components/pipeline-wizard.tsx), [suggestion-review-panel.tsx](components/suggestion-review-panel.tsx)) **nunca disparam diferente** do estado base — geram confusão de manutenção e sugerem um "light mode" que não existe. Decidir: ou implementar toggle de tema de verdade, ou remover as variantes.
8. **Sem toggle de tema / não respeita preferência do sistema.** Se "dark mode consistente?" é um objetivo: hoje é consistente *por ser forçado*, mas não há escolha de light mode. Se o público precisar de light, é trabalho não trivial (as cores são hardcoded em muitos lugares com `bg-black`, `text-white`, gradientes, além das CSS vars).

### 🟢 NICE-TO-HAVE
9. **Loading states estão bons no geral** (spinners, botões com `disabled`, textos "Processando..."/"Criando..." — ex. [login](app/(auth)/login/page.tsx#L141-L148), [new-project-dialog](components/new-project-dialog.tsx#L111-L115), [dashboard](app/(main)/page.tsx#L135-L141)). Elogio, não problema.
10. **Header pode ficar apertado no mobile.** Labels somem (`hidden sm:inline`) e sobram ícones (Dashboard, Comandos, Jobs, Livros, Settings, UserMenu) numa linha só — em telas bem estreitas pode espremer. Considerar menu "hamburger" abaixo de `sm`.
11. **`UserMenu` não é um menu.** Mostra nome + botão "Sair" direto ([user-menu.tsx](components/user-menu.tsx)). Sem dropdown, sem "perfil"/"conta". Ok para MVP; evoluir quando houver perfil.
12. **Empty states e busca estão bem feitos** (estado vazio inicial explicando Tese vs Projeto, empty state de busca com "Limpar pesquisa" — [page.tsx:142-179](app/(main)/page.tsx#L142-L179)). Bom.
13. **Acessibilidade básica parcial.** Inputs de login/forms têm `<Label htmlFor>` (bom), mas vários botões icon-only (lixeira, provavelmente nos headers) dependem de `title` em vez de `aria-label`. Varredura rápida mostrou uso irregular de `aria-*`.

---

## Ordem de execução recomendada

1. **Parte 0** — users table + bcrypt (fundação; sem ela nada funciona de verdade).
2. **Parte 2** — Esqueci minha senha (depende da 0).
3. **Parte 3** — Login Microsoft 365 (depende da 0; decidir allowlist vs criação automática).
4. **Parte 4** — correções de UX, priorizando os 3 itens CRÍTICOS (os 2 primeiros caem junto com Partes 0/2).

## Decisões que preciso de você antes de implementar
- [ ] Confirmar a Parte 0 (migrar para tabela `users` + bcrypt). **Bloqueia o resto.**
- [ ] Microsoft: **criar usuário automaticamente** ou **allowlist por domínio corporativo**?
- [ ] Endurecer **RLS** do Supabase agora ou deixar para depois?
- [ ] UX: implementar **light mode de verdade** ou **remover as classes `dark:` mortas**?
- [ ] Confirmar credenciais **SMTP do Brevo** para o Next.js (separadas do painel Supabase).
