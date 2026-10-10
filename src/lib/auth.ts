import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeCredentials } from "@/lib/auth-credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        return authorizeCredentials(email, password);
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },

    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as
          | "ADMIN"
          | "VENDEDOR"
          | "ENTREGADOR";
      }

      return session;
    },

    authorized: async ({ auth, request }) => {
      if (request.headers.has("next-action")) return true;

      return Boolean(auth?.user?.id && auth.user.role);
    },
  },
});