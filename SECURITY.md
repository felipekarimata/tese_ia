# 🔒 Política de Segurança - AutorIA MVP

## ⚠️ STATUS ATUAL: DESENVOLVIMENTO/TESTES (V1)

Este projeto está em **fase de validação da versão 1 (V1)** e **NÃO está pronto para uso em produção**.

---

## 🚨 Avisos Críticos de Segurança

### 1. Banco de Dados Supabase - Permissões Abertas

**ATENÇÃO:** O banco de dados está configurado com **permissões totalmente liberadas** para facilitar o desenvolvimento e testes.

#### Riscos Atuais:
- ❌ Qualquer usuário pode ler, inserir, modificar e deletar dados
- ❌ Não há autenticação ou validação de usuários
- ❌ Dados sensíveis podem ser expostos
- ❌ Sem segregação de dados por usuário
- ❌ Políticas RLS habilitadas mas com `USING (true)` (acesso total)

#### Estado das Políticas RLS:
```sql
-- CONFIGURAÇÃO ATUAL (INSEGURA)
CREATE POLICY "Enable all access for now"
ON [table_name] FOR ALL
USING (true);
```

**Status:** 🔴 **INSEGURO** - Adequado **APENAS** para desenvolvimento/testes

---

### 2. Credenciais e Chaves de API

#### Arquivo `.env.local`
- ⚠️ Contém chaves de API das IAs (OpenAI, Google, xAI)
- ⚠️ Credenciais do Supabase (URL e Anon Key)
- ✅ Arquivo protegido no `.gitignore`
- ❌ Chaves **NÃO são criptografadas**

#### Recomendações:
1. **NUNCA commite o arquivo `.env.local`** no repositório
2. Use `.env.local.example` como template
3. Mantenha suas credenciais locais privadas
4. Troque todas as chaves antes de ir para produção

---

### 3. Buckets de Storage

#### Buckets Atuais:
- `documents` - Privado (false)
- `translations` - Privado (false)
- `reference-materials` - **Público (true)** ⚠️
- `pipeline-outputs` - Privado (false)

**Atenção:** O bucket `reference-materials` é público. Avalie se isso é adequado.

---

## 📋 Checklist de Segurança para Produção

Antes de ir para produção, **OBRIGATORIAMENTE** implemente:

### Autenticação e Autorização
- [ ] Implementar Supabase Auth
- [ ] Adicionar coluna `user_id` em todas as tabelas
- [ ] Remover políticas `USING (true)`
- [ ] Criar políticas RLS baseadas em `auth.uid()`
- [ ] Implementar middleware de autenticação no Next.js
- [ ] Adicionar rate limiting

### Banco de Dados
- [ ] Segregar dados por usuário
- [ ] Implementar políticas RLS específicas por tabela
- [ ] Validar todas as operações no backend
- [ ] Configurar backups automáticos
- [ ] Habilitar auditoria de operações
- [ ] Revisar e otimizar índices

### Credenciais e Secrets
- [ ] Criptografar API keys no backend
- [ ] Usar variáveis de ambiente seguras
- [ ] Implementar rotação de chaves
- [ ] Usar secrets management (AWS Secrets Manager, etc)
- [ ] Remover chaves de desenvolvimento

### Aplicação
- [ ] Configurar CORS adequadamente
- [ ] Implementar validação de entrada (sanitização)
- [ ] Adicionar logging de erros e exceções
- [ ] Implementar monitoramento de segurança
- [ ] Configurar headers de segurança (CSP, HSTS, etc)
- [ ] Testar recuperação de desastres

### Storage
- [ ] Revisar permissões de todos os buckets
- [ ] Implementar políticas de acesso por usuário
- [ ] Adicionar validação de tipo de arquivo
- [ ] Limitar tamanho de uploads
- [ ] Escanear uploads por malware

---

## 🛡️ Exemplo de Configuração Segura

### Políticas RLS Seguras

```sql
-- 1. Remover política temporária
DROP POLICY "Enable all access for now" ON projects;

-- 2. Adicionar coluna de usuário
ALTER TABLE projects ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- 3. Criar políticas seguras
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);
```

### Middleware de Autenticação

```typescript
// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```

---

## 🔐 Boas Práticas de Desenvolvimento

### Para Desenvolvedores

1. **Nunca commite credenciais**
   - Use `.env.local` para desenvolvimento
   - Adicione `.env*` no `.gitignore`
   - Use `.env.local.example` como template

2. **Proteja suas chaves locais**
   - Não compartilhe seu `.env.local`
   - Troque chaves se expostas acidentalmente
   - Use chaves diferentes para dev/prod

3. **Valide entrada do usuário**
   - Sanitize todos os inputs
   - Valide tipos e formatos
   - Previna SQL injection e XSS

4. **Use HTTPS sempre**
   - Desenvolvimento: localhost é ok
   - Staging/Produção: HTTPS obrigatório
   - Configure headers de segurança

---

## 📞 Reporte de Vulnerabilidades

Se você descobrir uma vulnerabilidade de segurança:

1. **NÃO** abra uma issue pública
2. Entre em contato diretamente com os mantenedores
3. Forneça detalhes da vulnerabilidade
4. Aguarde resposta antes de divulgar publicamente

---

## 📚 Documentação Adicional

- [SUPABASE_SETUP_DOCUMENTATION.md](./SUPABASE_SETUP_DOCUMENTATION.md) - Documentação completa do banco de dados
- [README.md](./README.md) - Visão geral do projeto
- [Supabase Security Docs](https://supabase.com/docs/guides/auth)

---

## 📝 Changelog de Segurança

### v1.0.0-alpha (Atual)
- ⚠️ Banco de dados com permissões abertas
- ⚠️ Sem autenticação de usuários
- ⚠️ Adequado apenas para desenvolvimento/testes

### Planejado para v2.0.0 (Produção)
- ✅ Implementação de autenticação
- ✅ Políticas RLS seguras
- ✅ Segregação de dados por usuário
- ✅ Criptografia de credenciais

---

**Última atualização:** 2024-01-26
**Versão:** 1.0.0-alpha
**Status:** 🔴 Desenvolvimento - Não usar em produção
