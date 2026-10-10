// src/lib/prisma.ts
import { PrismaClient } from "../generated/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";


const adapter = new PrismaLibSQL({
  url: process.env.TURSO_URL!,
  authToken:  process.env.AUTH_TOKEN!,
});
export const prisma = new PrismaClient({ adapter });