import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"
import bcrypt from "bcryptjs"
import { getUserByEmail, createUser, setLastLogin, setAuthProvider } from "@/lib/auth-db"

/**
 * Autenticação com usuários persistidos no Supabase (tabela `users`).
 * Sessão via JWT (sem adapter de banco — compatível com Credentials).
 * O antigo Map em memória e o admin hardcoded foram removidos.
 *
 * Login Microsoft (Entra ID): só é registrado se AUTH_MICROSOFT_ENTRA_ID_ID
 * estiver definido (feature flag natural). O app Azure é Single-Tenant, então
 * só membros e convidados autorizados no tenant da RMSA chegam ao callback —
 * por isso confiamos no tenant e criamos o usuário automaticamente no primeiro
 * login (não há mais allowlist). Um usuário com is_active=false segue bloqueado.
 */
const microsoftEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim())

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)?.trim();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        if (!user) return null;
        if (!user.is_active) return null;
        // Usuário ainda não definiu senha (criado via admin / Microsoft):
        // precisa usar "esqueci minha senha" para ativar o acesso por senha.
        if (!user.password_hash) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        await setLastLogin(user.id);

        return {
          id: user.id,
          name: user.name ?? undefined,
          email: user.email,
          role: user.role,
        };
      },
    }),
    // Microsoft só é registrado quando a env está setada (feature flag natural).
    ...(microsoftEnabled
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER}/v2.0`,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/login",
    error: "/error",
  },
  callbacks: {
    // Login Microsoft: confia no tenant Single-Tenant da RMSA. Cria o usuário
    // automaticamente no primeiro acesso; respeita is_active para quem já existe.
    async signIn({ account, profile, user }) {
      if (account?.provider === "microsoft-entra-id") {
        const p = (profile ?? {}) as Record<string, unknown>;
        const email = (
          (p.email as string | undefined) ||
          (p.preferred_username as string | undefined) ||
          (user?.email as string | undefined) ||
          ""
        ).trim().toLowerCase();

        if (!email) return false;

        const dbUser = await getUserByEmail(email);

        // Usuário já existe: respeita o flag is_active (admin pode ter desativado).
        if (dbUser) {
          if (!dbUser.is_active) return false;
          await setLastLogin(dbUser.id);
          // Marca como 'microsoft' apenas se ainda não usa credenciais.
          if (dbUser.auth_provider !== "credentials") {
            await setAuthProvider(dbUser.id, "microsoft");
          }
          return true;
        }

        // Não existe: criação automática (role 'user', ativo). O nome vem do
        // profile; se vazio, derivamos da parte local do email.
        const name =
          ((p.name as string | undefined) || (user?.name as string | undefined) || "").trim() ||
          email.split("@")[0];
        const created = await createUser({ email, name, role: "user" });
        await setAuthProvider(created.id, "microsoft");
        await setLastLogin(created.id);
        return true;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // Credentials: user já traz id e role.
      if (user && (user as { role?: string }).role) {
        token.sub = user.id;
        token.role = (user as { role?: string }).role;
        return token;
      }
      // OAuth (Microsoft): resolve o usuário do banco pelo email para
      // usar o id/role da tabela `users` (não o oid do Entra).
      if (account?.provider === "microsoft-entra-id" && token.email) {
        const dbUser = await getUserByEmail(token.email as string);
        if (dbUser) {
          token.sub = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      if (token.role) {
        session.user.role = token.role as string;
      }
      return session;
    },
  },
})
