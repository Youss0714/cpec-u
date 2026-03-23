import { useEffect, useState } from "react";

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 400);
    const t2 = setTimeout(() => setPhase("out"), 9000);
    const t3 = setTimeout(() => onDone(), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        background: "radial-gradient(ellipse at 60% 40%, #e8f4fd 0%, #f0f9f0 50%, #f8f8ff 100%)",
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "out" ? "opacity 0.9s ease-in-out" : "none",
        pointerEvents: "none",
      }}
    >
      <div
        className="flex flex-col items-center gap-8"
        style={{
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "translateY(24px) scale(0.94)" : "translateY(0) scale(1)",
          transition: "opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div
          className="rounded-3xl bg-white p-8 flex items-center justify-center"
          style={{
            boxShadow: "0 8px 48px 0 rgba(30,80,160,0.13), 0 2px 12px 0 rgba(60,140,60,0.08)",
            animation: phase === "hold" ? "splash-float 3.5s ease-in-out infinite" : "none",
          }}
        >
          <img
            src="/logo.png"
            alt="CPEC-Digital"
            className="w-64 h-auto select-none"
            draggable={false}
            style={{ display: "block" }}
          />
        </div>

        <div className="text-center space-y-1">
          <p
            className="text-sm font-semibold tracking-[0.22em] uppercase"
            style={{ color: "#2d6a4f", letterSpacing: "0.22em" }}
          >
            Gestion Académique
          </p>
          <p className="text-xs text-slate-400 tracking-widest">Système de gestion intégré</p>
        </div>

        <div className="w-56 h-1 rounded-full overflow-hidden bg-slate-100">
          <div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, #1d6fa4 0%, #3aaa6f 100%)",
              width: phase === "hold" ? "100%" : "0%",
              transition: phase === "hold" ? "width 8.4s cubic-bezier(0.4,0,0.2,1)" : "none",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes splash-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
