// src/app/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";


export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  switch (session.user.role) {
    case "ADMIN":
      redirect("/dashboard");
    case "VENDEDOR":
      redirect("/dashboard");
    case "ENTREGADOR":
      redirect("/dashboard");
    default:
      redirect("/login");
  }
}