import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { EntregadorView } from "../entregador-view";

export default async function MinhasEntregasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ENTREGADOR") redirect("/dashboard");
  const { erro } = await searchParams;

  return (
    <>
      {erro && (
        <p role="alert" className="mx-8 mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {erro}
        </p>
      )}
      <EntregadorView entregadorId={session.user.id} view="mine" />
    </>
  );
}
