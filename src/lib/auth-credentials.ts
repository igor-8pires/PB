import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function authorizeCredentials(email?: string, password?: string) {
  if (!email || !password) return null;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.active) return null;

  const passwordValid = await compare(password, user.passwordHash);

  if (!passwordValid) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}