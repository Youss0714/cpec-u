import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${BASE}/api/push/vapid-public-key`, { credentials: "include" });
  if (!res.ok) throw new Error("Push notifications not configured");
  const data = await res.json();
  return data.publicKey;
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const res = await fetch(`${BASE}/api/push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!res.ok) throw new Error("Failed to save subscription");
}

async function deleteSubscription(endpoint: string): Promise<void> {
  await fetch(`${BASE}/api/push/unsubscribe`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

type Status = "idle" | "checking" | "subscribed" | "blocked" | "unsupported" | "unsubscribed";

export function PushNotificationToggle({ className }: { className?: string }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("checking");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    setStatus("checking");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    const permission = Notification.permission;
    if (permission === "denied") {
      setStatus("blocked");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setStatus(existing ? "subscribed" : "unsubscribed");
    } catch {
      setStatus("unsupported");
    }
  }

  async function handleSubscribe() {
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("blocked");
        toast({ title: "Notifications bloquées", description: "Veuillez autoriser les notifications dans les paramètres du navigateur.", variant: "destructive" });
        return;
      }

      const vapidKey = await getVapidPublicKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await saveSubscription(sub);
      setStatus("subscribed");
      toast({ title: "Notifications push activées", description: "Vous recevrez des notifications même lorsque l'application est fermée." });
    } catch (err: any) {
      console.error("subscribe error", err);
      toast({ title: "Erreur", description: "Impossible d'activer les notifications push.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsubscribe() {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deleteSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("unsubscribed");
      toast({ title: "Notifications push désactivées" });
    } catch (err) {
      console.error("unsubscribe error", err);
      toast({ title: "Erreur", description: "Impossible de désactiver les notifications.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (status === "checking") {
    return (
      <Button variant="outline" size="sm" disabled className={className}>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Vérification…
      </Button>
    );
  }

  if (status === "unsupported") {
    return (
      <Button variant="outline" size="sm" disabled className={className} title="Votre navigateur ne supporte pas les notifications push">
        <BellOff className="w-4 h-4 mr-2 opacity-50" />
        Push non supporté
      </Button>
    );
  }

  if (status === "blocked") {
    return (
      <Button variant="outline" size="sm" disabled className={className} title="Notifications bloquées dans les paramètres du navigateur">
        <BellOff className="w-4 h-4 mr-2 text-destructive" />
        Notifications bloquées
      </Button>
    );
  }

  if (status === "subscribed") {
    return (
      <Button
        variant="outline" size="sm"
        onClick={handleUnsubscribe}
        disabled={loading}
        className={`border-green-300 text-green-700 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors ${className ?? ""}`}
      >
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BellRing className="w-4 h-4 mr-2 text-green-600" />}
        {loading ? "…" : "Push activé — Désactiver"}
      </Button>
    );
  }

  return (
    <Button
      variant="outline" size="sm"
      onClick={handleSubscribe}
      disabled={loading}
      className={className}
    >
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bell className="w-4 h-4 mr-2" />}
      {loading ? "Activation…" : "Activer les notifications push"}
    </Button>
  );
}
