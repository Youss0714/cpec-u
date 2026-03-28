import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Key, Plus, Trash2, ShieldCheck, LogOut, Copy, RotateCcw,
  Ban, CheckCircle, Infinity, Calendar, Clock,
  UserCog, RefreshCw, Eye, EyeOff, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "/api/dev";

interface ActivationKey {
  id: number;
  key: string;
  duration: "lifetime" | "1year" | "2years" | "5years" | "10years";
  status: "available" | "assigned" | "revoked";
  assignedToUserId?: string | null;
  assignedAt?: string | null;
  shownAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

const DURATION_LABELS: Record<string, string> = {
  lifetime: "À vie",
  "1year": "1 an",
  "2years": "2 ans",
  "5years": "5 ans",
  "10years": "10 ans",
};

const DURATION_ICONS: Record<string, React.ReactNode> = {
  lifetime: <Infinity className="w-3.5 h-3.5" />,
  "1year": <Calendar className="w-3.5 h-3.5" />,
  "2years": <Calendar className="w-3.5 h-3.5" />,
  "5years": <Clock className="w-3.5 h-3.5" />,
  "10years": <Clock className="w-3.5 h-3.5" />,
};

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  available: { label: "Disponible", class: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  assigned:  { label: "Assignée",   class: "bg-blue-100 text-blue-700 border-blue-200" },
  revoked:   { label: "Révoquée",   class: "bg-red-100 text-red-700 border-red-200" },
};

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function formatKey(k: string): string {
  // Format as XXXX-XXXX-XXXX-XXXX
  return k.replace(/-/g, "").match(/.{1,4}/g)?.join("-") ?? k;
}

interface Directeur {
  id: number;
  name: string;
  email: string;
  createdAt: string | null;
  firstLoginAt: string | null;
}

export default function DevDashboard() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [keys, setKeys] = useState<ActivationKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingForm, setGeneratingForm] = useState(false);
  const [genDuration, setGenDuration] = useState("lifetime");
  const [genCount, setGenCount] = useState("1");
  const [genNotes, setGenNotes] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Tab navigation
  const [activeTab, setActiveTab] = useState<"keys" | "directeurs">("keys");

  // Directeurs & reset password
  const [directeurs, setDirecteurs] = useState<Directeur[]>([]);
  const [directeursLoading, setDirecteursLoading] = useState(false);
  const [resetingId, setResetingId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  useEffect(() => {
    fetch(`${API}/me`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setAuthenticated(!!d.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (authenticated) fetchKeys();
  }, [authenticated]);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/keys`, { credentials: "include" });
      if (r.ok) setKeys(await r.json());
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const r = await fetch(`${API}/auth`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: loginPassword }),
      });
      const d = await r.json();
      if (r.ok) {
        setAuthenticated(true);
      } else {
        setLoginError(d.error ?? "Erreur d'authentification");
      }
    } catch {
      setLoginError("Erreur réseau");
    }
  };

  const handleLogout = async () => {
    await fetch(`${API}/logout`, { method: "POST", credentials: "include" });
    setAuthenticated(false);
    setKeys([]);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await fetch(`${API}/keys`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration: genDuration, count: parseInt(genCount) || 1, notes: genNotes || undefined }),
      });
      if (r.ok) {
        setGeneratingForm(false);
        setGenDuration("lifetime");
        setGenCount("1");
        setGenNotes("");
        await fetchKeys();
      }
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette clé ?")) return;
    await fetch(`${API}/keys/${id}`, { method: "DELETE", credentials: "include" });
    setKeys(k => k.filter(x => x.id !== id));
  };

  const handleRevoke = async (id: number) => {
    if (!confirm("Révoquer cette clé ?")) return;
    const r = await fetch(`${API}/keys/${id}/revoke`, { method: "PATCH", credentials: "include" });
    if (r.ok) {
      const updated = await r.json();
      setKeys(k => k.map(x => x.id === id ? updated : x));
    }
  };

  const handleCopy = (id: number, key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchDirecteurs = async () => {
    setDirecteursLoading(true);
    try {
      const r = await fetch(`${API}/directeurs`, { credentials: "include" });
      if (r.ok) setDirecteurs(await r.json());
    } finally {
      setDirecteursLoading(false);
    }
  };

  const openResetForm = (id: number) => {
    setResetingId(id);
    setResetPassword("");
    setResetConfirm("");
    setResetError("");
    setResetSuccess("");
    setShowResetPwd(false);
    setShowResetConfirm(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");
    if (resetPassword !== resetConfirm) {
      setResetError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (resetPassword.length < 6) {
      setResetError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setResetLoading(true);
    try {
      const r = await fetch(`${API}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: resetingId, newPassword: resetPassword }),
      });
      const d = await r.json();
      if (r.ok) {
        setResetSuccess(d.message);
        setResetPassword("");
        setResetConfirm("");
        setTimeout(() => { setResetingId(null); setResetSuccess(""); }, 2500);
      } else {
        setResetError(d.error ?? "Erreur lors de la réinitialisation");
      }
    } catch {
      setResetError("Erreur réseau");
    } finally {
      setResetLoading(false);
    }
  };

  const handleTabChange = (tab: "keys" | "directeurs") => {
    setActiveTab(tab);
    if (tab === "directeurs" && directeurs.length === 0) fetchDirecteurs();
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 mb-4">
              <ShieldCheck className="w-8 h-8 text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Espace Développeur</h1>
            <p className="text-sm text-zinc-500 mt-1">Accès restreint — CPEC-Digital</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs uppercase tracking-wider">Mot de passe développeur</Label>
              <Input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="••••••••••••"
                className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 focus:border-violet-500 focus:ring-violet-500/20"
                autoFocus
              />
            </div>
            {loginError && (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <Ban className="w-3.5 h-3.5" />{loginError}
              </p>
            )}
            <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700 text-white">
              Accéder à l'espace développeur
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const filteredKeys = statusFilter === "all" ? keys : keys.filter(k => k.status === statusFilter);
  const stats = {
    total: keys.length,
    available: keys.filter(k => k.status === "available").length,
    assigned: keys.filter(k => k.status === "assigned").length,
    revoked: keys.filter(k => k.status === "revoked").length,
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Top bar */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">CPEC-Digital</p>
              <p className="text-[11px] text-zinc-500">Espace Développeur</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800"
          >
            <LogOut className="w-3.5 h-3.5" />
            Déconnexion
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Tab navigation */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
          <button
            onClick={() => handleTabChange("keys")}
            className={cn(
              "flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors",
              activeTab === "keys"
                ? "bg-violet-600 text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            )}
          >
            <Key className="w-4 h-4" />
            Clés d'activation
          </button>
          <button
            onClick={() => handleTabChange("directeurs")}
            className={cn(
              "flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors",
              activeTab === "directeurs"
                ? "bg-violet-600 text-white"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            )}
          >
            <UserCog className="w-4 h-4" />
            Directeurs de Centre
          </button>
        </div>

        {/* Stats - only on keys tab */}
        {activeTab === "keys" && <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, color: "text-zinc-300" },
            { label: "Disponibles", value: stats.available, color: "text-emerald-400" },
            { label: "Assignées", value: stats.assigned, color: "text-blue-400" },
            { label: "Révoquées", value: stats.revoked, color: "text-red-400" },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        }

        {/* Keys section */}
        {activeTab === "keys" && <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-violet-400" />
                Clés d'activation
              </h2>
              <div className="flex gap-1">
                {["all", "available", "assigned", "revoked"].map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full transition-colors",
                      statusFilter === f
                        ? "bg-violet-600 text-white"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    )}
                  >
                    {f === "all" ? "Toutes" : STATUS_CONFIG[f]?.label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={() => setGeneratingForm(v => !v)}
              className="bg-violet-600 hover:bg-violet-700 text-white text-sm gap-2"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              Générer des clés
            </Button>
          </div>

          {/* Generate form */}
          {generatingForm && (
            <div className="bg-zinc-900 border border-violet-500/30 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-violet-300 mb-4">Nouvelle(s) clé(s) d'activation</h3>
              <form onSubmit={handleGenerate} className="grid grid-cols-4 gap-4 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Durée</Label>
                  <Select value={genDuration} onValueChange={setGenDuration}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      {Object.entries(DURATION_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v} className="text-white hover:bg-zinc-700">{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Quantité</Label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={genCount}
                    onChange={e => setGenCount(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-zinc-400">Notes (optionnel)</Label>
                  <Input
                    value={genNotes}
                    onChange={e => setGenNotes(e.target.value)}
                    placeholder="ex: CPEC Ouagadougou 2025"
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1 bg-violet-600 hover:bg-violet-700 text-white">
                    Générer
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setGeneratingForm(false)}
                    className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800">
                    Annuler
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Keys list */}
          {loading ? (
            <div className="text-center py-12 text-zinc-600">Chargement...</div>
          ) : filteredKeys.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
              <Key className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">Aucune clé d'activation. Générez-en depuis le bouton ci-dessus.</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-800/40">
                    <th className="text-left px-5 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Clé</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Durée</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Statut</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Expiration</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Notes</th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-500 font-medium uppercase tracking-wider">Créée le</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredKeys.map(k => (
                    <tr key={k.id} className="hover:bg-zinc-800/30 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-violet-300 bg-violet-500/10 px-2 py-1 rounded border border-violet-500/20 tracking-widest">
                            {k.key}
                          </code>
                          <button
                            onClick={() => handleCopy(k.id, k.key)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-violet-400"
                            title="Copier"
                          >
                            {copiedId === k.id
                              ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                              : <Copy className="w-3.5 h-3.5" />
                            }
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="flex items-center gap-1.5 text-zinc-300 text-xs">
                          {DURATION_ICONS[k.duration]}
                          {DURATION_LABELS[k.duration]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className={`text-[11px] ${STATUS_CONFIG[k.status]?.class}`}>
                          {STATUS_CONFIG[k.status]?.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-zinc-500 text-xs">
                        {k.expiresAt ? formatDate(k.expiresAt) : <span className="text-violet-400 flex items-center gap-1"><Infinity className="w-3 h-3" />À vie</span>}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-600 text-xs">{k.notes ?? "—"}</td>
                      <td className="px-4 py-3.5 text-zinc-600 text-xs">{formatDate(k.createdAt)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {k.status === "available" && (
                            <button
                              onClick={() => handleRevoke(k.id)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                              title="Révoquer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(k.id)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>}

        {/* Directeurs section */}
        {activeTab === "directeurs" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <UserCog className="w-5 h-5 text-violet-400" />
                Directeurs de Centre
              </h2>
              <button
                onClick={fetchDirecteurs}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-zinc-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Actualiser
              </button>
            </div>

            {directeursLoading ? (
              <div className="text-center py-12 text-zinc-600">Chargement...</div>
            ) : directeurs.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
                <UserCog className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-500 text-sm">Aucun directeur de centre enregistré.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {directeurs.map(d => (
                  <div key={d.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-semibold text-sm">
                          {d.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{d.name}</p>
                          <p className="text-xs text-zinc-500">{d.email}</p>
                          <p className="text-xs text-zinc-600 mt-0.5">
                            {d.firstLoginAt ? `Première connexion : ${formatDate(d.firstLoginAt)}` : "Jamais connecté"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => openResetForm(resetingId === d.id ? null! : d.id)}
                        className={cn(
                          "flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-colors",
                          resetingId === d.id
                            ? "bg-zinc-700 text-zinc-300"
                            : "bg-violet-600/20 border border-violet-500/30 text-violet-400 hover:bg-violet-600/30"
                        )}
                      >
                        <Key className="w-3.5 h-3.5" />
                        Réinitialiser le mot de passe
                      </button>
                    </div>

                    {resetingId === d.id && (
                      <div className="border-t border-zinc-800 bg-zinc-950/60 px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-medium text-violet-300">
                            Nouveau mot de passe pour <span className="text-white">{d.name}</span>
                          </p>
                          <button onClick={() => setResetingId(null)} className="text-zinc-600 hover:text-zinc-400">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <form onSubmit={handleResetPassword} className="grid grid-cols-3 gap-3 items-end">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Nouveau mot de passe</Label>
                            <div className="relative">
                              <Input
                                type={showResetPwd ? "text" : "password"}
                                value={resetPassword}
                                onChange={e => setResetPassword(e.target.value)}
                                placeholder="Minimum 6 caractères"
                                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 pr-9"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowResetPwd(v => !v)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                              >
                                {showResetPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-zinc-400">Confirmer le mot de passe</Label>
                            <div className="relative">
                              <Input
                                type={showResetConfirm ? "text" : "password"}
                                value={resetConfirm}
                                onChange={e => setResetConfirm(e.target.value)}
                                placeholder="Répéter le mot de passe"
                                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 pr-9"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setShowResetConfirm(v => !v)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                              >
                                {showResetConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                          <Button
                            type="submit"
                            disabled={resetLoading}
                            className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                          >
                            {resetLoading
                              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              : <Key className="w-4 h-4" />
                            }
                            Confirmer
                          </Button>
                        </form>
                        {resetError && (
                          <p className="mt-2 text-xs text-red-400">{resetError}</p>
                        )}
                        {resetSuccess && (
                          <p className="mt-2 text-xs text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5" />
                            {resetSuccess}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
