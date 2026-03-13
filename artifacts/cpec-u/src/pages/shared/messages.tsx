import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, UserCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, { credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function roleLabel(role: string, subRole?: string) {
  if (role === "student") return "Étudiant";
  if (role === "teacher") return "Enseignant";
  if (role === "admin") {
    if (subRole === "scolarite") return "Scolarité";
    if (subRole === "planificateur") return "Direction pédagogique";
    if (subRole === "directeur") return "Directeur";
  }
  return role;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export default function SharedMessages({ allowedRoles }: { allowedRoles: string[] }) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery({
    queryKey: ["/api/messages"],
    queryFn: () => apiFetch("/messages"),
    refetchInterval: 8000,
  });

  const { data: thread } = useQuery({
    queryKey: ["/api/messages", selectedUserId],
    queryFn: () => apiFetch(`/messages/${selectedUserId}`),
    enabled: selectedUserId !== null,
    refetchInterval: 5000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages]);

  useEffect(() => {
    if (selectedUserId) {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    }
  }, [(thread?.messages as any[])?.length]);

  const convs = conversations as any[];
  const msgs = (thread?.messages ?? []) as any[];
  const other = thread?.other as any;

  const handleSend = async () => {
    if (!messageText.trim() || !selectedUserId) return;
    setSending(true);
    try {
      await apiFetch("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: selectedUserId, content: messageText.trim() }),
      });
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    } catch {
      toast({ title: "Erreur lors de l'envoi", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AppLayout allowedRoles={allowedRoles}>
      <div className="flex flex-col h-[calc(100vh-120px)]">
        <div className="mb-4 flex-shrink-0">
          <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-primary" />
            Messages
          </h1>
          <p className="text-muted-foreground text-sm">Vos échanges avec l'administration.</p>
        </div>

        <div className="flex flex-1 gap-4 min-h-0 rounded-2xl border border-border overflow-hidden bg-card shadow-sm">
          {/* Left: conversations */}
          <div className="w-64 flex-shrink-0 border-r border-border flex flex-col">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversations</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {convs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 px-4 text-center">
                  <MessageSquare className="w-7 h-7 opacity-20" />
                  <p className="text-xs">Aucun message reçu pour l'instant.</p>
                </div>
              ) : (
                convs.map((c: any) => (
                  <button
                    key={c.userId}
                    onClick={() => setSelectedUserId(c.userId)}
                    className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-muted/50 transition-colors border-b border-border/50 ${
                      selectedUserId === c.userId ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                      <UserCircle2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-semibold truncate">{c.userName}</span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatTime(c.lastAt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">{c.lastMessage}</p>
                        {c.unreadCount > 0 && (
                          <Badge className="h-4 min-w-4 text-[10px] px-1 bg-primary flex-shrink-0">{c.unreadCount}</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: thread */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedUserId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <MessageSquare className="w-12 h-12 opacity-15" />
                <p className="text-sm">Sélectionnez une conversation.</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <UserCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{other?.name ?? "…"}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel(other?.role ?? "", other?.adminSubRole)}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {msgs.map((m: any) => {
                    const isMe = m.senderId !== selectedUserId;
                    return (
                      <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                          isMe
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        }`}>
                          <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                          <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            {formatTime(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div className="px-4 py-3 border-t border-border flex gap-2 flex-shrink-0">
                  <Input
                    placeholder="Répondre…"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1"
                    disabled={sending}
                  />
                  <Button onClick={handleSend} disabled={sending || !messageText.trim()} size="icon">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
