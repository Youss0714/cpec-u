import { useEffect, useState } from "react";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 600);
    const t2 = setTimeout(() => setPhase("out"), 2000);
    const t3 = setTimeout(() => onDone(), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
      style={{
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "out" ? "opacity 0.55s ease-in-out" : "none",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "translateY(18px) scale(0.96)" : "translateY(0) scale(1)",
          transition: "opacity 0.5s ease-out, transform 0.5s ease-out",
        }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-primary shadow-xl">
          <span className="text-primary-foreground font-serif font-bold text-3xl tracking-tight select-none">C</span>
          <span
            className="absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full bg-primary-foreground/70"
            style={{ animation: "splash-pulse 1.2s ease-in-out infinite" }}
          />
        </div>

        <div className="text-center">
          <h1 className="font-serif font-bold text-4xl tracking-tight text-foreground">CPEC-U</h1>
          <p className="text-muted-foreground text-sm mt-1 tracking-widest uppercase">Gestion Académique</p>
        </div>

        <div className="mt-6 w-48 h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary"
            style={{
              width: phase === "hold" ? "100%" : "0%",
              transition: phase === "hold" ? "width 1.3s cubic-bezier(0.4,0,0.2,1)" : "none",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes splash-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
