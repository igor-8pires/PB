"use client";

import { Printer } from "lucide-react";

export function ReportPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
    >
      <Printer className="size-4" aria-hidden="true" />
      Imprimir / Salvar PDF
    </button>
  );
}