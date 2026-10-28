import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { getUserByEmail, setLastLogin } from "@/lib/auth-db"

/**
 * Autenticação com usuários persistidos no Supabase (tabela `users`).
 * Sessão via JWT (sem adapter de banco — compatível com Credentials).
 * O antigo Map em memória e o admin hardcoded foram removidos.
 */
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
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        // `role` vem do authorize (Credentials) ou é resolvido no signIn (OAuth)
        if ((user as { role?: string }).role) {
          token.role = (user as { role?: string }).role;
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
