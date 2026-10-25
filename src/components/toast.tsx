"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info } from "lucide-react";

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const Ctx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 5000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex max-w-lg items-start gap-2.5 rounded-xl border border-line bg-card px-4 py-3 text-sm text-ink shadow-[0_8px_30px_rgba(14,27,51,0.12)]"
          >
            {t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green" /> : t.kind === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
