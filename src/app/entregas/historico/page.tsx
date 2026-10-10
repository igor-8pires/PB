import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { EntregadorView } from "../entregador-view";

export default async function HistoricoEntregasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ENTREGADOR") redirect("/dashboard");

  return <EntregadorView entregadorId={session.user.id} view="history" />;
}
