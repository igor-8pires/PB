// src/types/next-auth.d.ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "ADMIN" | "VENDEDOR" | "ENTREGADOR";
    } & DefaultSession["user"];
  }

  interface User {
    role: "ADMIN" | "VENDEDOR" | "ENTREGADOR";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "VENDEDOR" | "ENTREGADOR";
  }
}
