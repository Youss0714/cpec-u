import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageSquare, Send, Search, UserCircle2, GraduationCap, BookOpen, Plus, Users, CheckCircle2 } from "lucide-react";
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

function RoleIcon({ role }: { role: string }) {
  if (role === "student") return <GraduationCap className="w-4 h-4" />;
  if (role === "teacher") return <BookOpen className="w-4 h-4" />;
  return <UserCircle2 className="w-4 h-4" />;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

export default function AdminMessages() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  // Broadcast state
  const [broadcastClassId, setBroadcastClassId] = useState<number | null>(null);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastSent, setBroadcastSent] = useState<number | null>(null);

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

  const { data: contacts = [] } = useQuery({
    queryKey: ["/api/messages/contacts/list"],
    queryFn: () => apiFetch("/messages/contacts/list"),
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["/api/messages/classes/list"],
    queryFn: () => apiFetch("/messages/classes/list"),
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
  const allContacts = contacts as any[];
  const allClasses = classes as any[];

  const filteredConvs = convs.filter((c: any) =>
    c.userName?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredContacts = allContacts.filter((c: any) =>
    c.name?.toLowerCase().includes(contactSearch.toLowerCase())
  );

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startConversation = (userId: number) => {
    setSelectedUserId(userId);
    setShowNewDialog(false);
    setContactSearch("");
  };

  const handleBroadcast = async () => {
    if (!broadcastClassId || !broadcastText.trim()) return;
    setBroadcastSending(true);
    setBroadcastSent(null);
    try {
      const data = await apiFetch(`/messages/class/${broadcastClassId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: broadcastText.trim() }),
      });
      setBroadcastSent(data.sent);
      setBroadcastText("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    } catch (e: any) {
      toast({ title: "Erreur lors de l'envoi", description: e.message, variant: "destructive" });
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setShowNewDialog(open);
    if (!open) {
      setBroadcastClassId(null);
      setBroadcastText("");
      setBroadcastSent(null);
      setContactSearch("");
    }
  };

  return (
    <AppLayout allowedRoles={["admin"]}>
      <div className="flex flex-col h-[calc(100vh-120px)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="w-8 h-8 text-primary" />
              Messages
            </h1>
            <p className="text-muted-foreground text-sm">Échangez avec les étudiants et enseignants.</p>
          </div>
          <Button onClick={() => setShowNewDialog(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nouveau message
          </Button>
        </div>

        {/* Chat layout */}
        <div className="flex flex-1 gap-4 min-h-0 rounded-2xl border border-border overflow-hidden bg-card shadow-sm">
          {/* Left: conversations list */}
          <div className="w-72 flex-shrink-0 border-r border-border flex flex-col">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Rechercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm bg-background"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredConvs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 px-4 text-center">
                  <MessageSquare className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Aucune conversation. Commencez par envoyer un message.</p>
                </div>
              ) : (
                filteredConvs.map((c: any) => (
                  <button
                    key={c.userId}
                    onClick={() => setSelectedUserId(c.userId)}
                    className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-muted/50 transition-colors border-b border-border/50 ${
                      selectedUserId === c.userId ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
                      <RoleIcon role={c.userRole} />
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
                <p className="text-sm">Sélectionnez une conversation ou démarrez-en une nouvelle.</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <RoleIcon role={other?.role ?? ""} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{other?.name ?? "…"}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel(other?.role ?? "", other?.adminSubRole)}</p>
                  </div>
                </div>

                {/* Messages */}
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

                {/* Input */}
                <div className="px-4 py-3 border-t border-border flex gap-2 flex-shrink-0">
                  <Input
                    placeholder="Écrire un message…"
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

        {/* New conversation dialog */}
        <Dialog open={showNewDialog} onOpenChange={handleDialogClose}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Nouveau message
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="individuel" className="mt-1">
              <TabsList className="w-full">
                <TabsTrigger value="individuel" className="flex-1 gap-2">
                  <UserCircle2 className="w-3.5 h-3.5" />
                  Individuel
                </TabsTrigger>
                <TabsTrigger value="classe" className="flex-1 gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Toute une classe
                </TabsTrigger>
              </TabsList>

              {/* Individual tab */}
              <TabsContent value="individuel" className="space-y-3 mt-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un étudiant ou enseignant…"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-8"
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                  {filteredContacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Aucun résultat</p>
                  ) : (
                    filteredContacts.map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => startConversation(c.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                          <RoleIcon role={c.role} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{roleLabel(c.role)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* Broadcast tab */}
              <TabsContent value="classe" className="space-y-3 mt-3">
                {broadcastSent !== null ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <CheckCircle2 className="w-12 h-12 text-green-500" />
                    <p className="text-sm font-semibold text-foreground">
                      Message envoyé à {broadcastSent} étudiant{broadcastSent > 1 ? "s" : ""} !
                    </p>
                    <Button variant="outline" size="sm" onClick={() => setBroadcastSent(null)}>
                      Envoyer un autre message
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Sélectionnez une classe :</p>
                      <div className="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto pr-1">
                        {allClasses.map((cls: any) => (
                          <button
                            key={cls.id}
                            onClick={() => setBroadcastClassId(cls.id)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors text-sm ${
                              broadcastClassId === cls.id
                                ? "border-primary bg-primary/5 text-primary font-medium"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 flex-shrink-0" />
                              {cls.name}
                            </span>
                            <Badge variant="secondary" className="text-[10px] px-1.5">
                              {cls.studentCount} étud.
                            </Badge>
                          </button>
                        ))}
                        {allClasses.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">Aucune classe disponible</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Message :</p>
                      <Textarea
                        placeholder="Rédigez votre message pour toute la classe…"
                        value={broadcastText}
                        onChange={(e) => setBroadcastText(e.target.value)}
                        rows={4}
                        className="resize-none"
                      />
                    </div>

                    <Button
                      className="w-full gap-2"
                      disabled={!broadcastClassId || !broadcastText.trim() || broadcastSending}
                      onClick={handleBroadcast}
                    >
                      <Send className="w-4 h-4" />
                      {broadcastSending ? "Envoi en cours…" : "Envoyer à toute la classe"}
                    </Button>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
