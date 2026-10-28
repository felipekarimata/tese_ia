import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"
import bcrypt from "bcryptjs"
import { getUserByEmail, setLastLogin, setAuthProvider } from "@/lib/auth-db"

/**
 * Autenticação com usuários persistidos no Supabase (tabela `users`).
 * Sessão via JWT (sem adapter de banco — compatível com Credentials).
 * O antigo Map em memória e o admin hardcoded foram removidos.
 *
 * Login Microsoft (Entra ID): só é registrado se AUTH_MICROSOFT_ENTRA_ID_ID
 * estiver definido (feature flag natural). O acesso é por ALLOWLIST: só entra
 * quem já está pré-cadastrado e ativo na tabela `users`.
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
  },
  callbacks: {
    // ALLOWLIST: login Microsoft só é permitido para email já cadastrado e ativo.
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
        if (!dbUser) return false;            // não está na allowlist
        if (!dbUser.is_active) return false;  // conta desativada

        await setLastLogin(dbUser.id);
        // Marca como 'microsoft' apenas se o usuário ainda não usa credenciais.
        if (dbUser.auth_provider !== "credentials") {
          await setAuthProvider(dbUser.id, "microsoft");
        }
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
