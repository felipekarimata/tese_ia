import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

// In-memory user storage (for MVP - replace with database later)
const users = new Map<string, { id: string; name: string; email: string; password: string }>();

// Pre-create admin user
users.set("admin@tese.com", {
  id: "admin-001",
  name: "Administrador",
  email: "admin@tese.com",
  password: "Alterar@01"
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
        name: { label: "Nome", type: "text" },
        action: { label: "Ação", type: "text" }
      },
      async authorize(credentials) {
        const action = credentials.action as string;
        const email = credentials.email as string;
        const password = credentials.password as string;
        const name = credentials.name as string;

        if (action === "signup") {
          // Check if user already exists
          if (users.has(email)) {
            throw new Error("Email já cadastrado");
          }

          // Create new user
          const newUser = {
            id: Math.random().toString(36).substring(7),
            name: name || email.split("@")[0],
            email,
            password // In production, hash this!
          };
          users.set(email, newUser);

          return {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email
          };
        }

        // Login
        const user = users.get(email);
        if (!user || user.password !== password) {
          throw new Error("Email ou senha inválidos");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email
        };
      }
    })
  ],
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    }
  }
})
