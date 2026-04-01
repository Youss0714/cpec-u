import { useState, useCallback } from "react";
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

export { browserSupportsWebAuthn };

// LocalStorage key for tracking registered credential IDs on this device
const LS_KEY = "cpec_webauthn_emails";

export function getWebAuthnEmails(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}
export function addWebAuthnEmail(email: string) {
  const emails = getWebAuthnEmails();
  if (!emails.includes(email)) {
    localStorage.setItem(LS_KEY, JSON.stringify([...emails, email]));
  }
}
export function removeWebAuthnEmail(email: string) {
  const emails = getWebAuthnEmails().filter(e => e !== email);
  localStorage.setItem(LS_KEY, JSON.stringify(emails));
}
export function hasWebAuthnForEmail(email: string): boolean {
  return getWebAuthnEmails().includes(email);
}

// ── Registration ─────────────────────────────────────────────────────────────
export function useWebAuthnRegister() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useCallback(async (deviceName?: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get challenge from server
      const optRes = await fetch("/api/auth/webauthn/register/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!optRes.ok) {
        const err = await optRes.json();
        setError(err.error ?? "Erreur lors de l'initialisation");
        return false;
      }
      const options = await optRes.json();

      // 2. Ask browser/device to create credential (triggers Face ID / Touch ID prompt)
      const credential = await startRegistration({ optionsJSON: options });

      // 3. Verify with server and store
      const verifyRes = await fetch("/api/auth/webauthn/register/finish", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: credential, deviceName }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        setError(err.error ?? "Vérification échouée");
        return false;
      }
      return true;
    } catch (err: any) {
      // User cancelled or device doesn't support
      if (err?.name === "NotAllowedError") {
        setError("Authentification biométrique annulée.");
      } else {
        setError(err?.message ?? "Erreur inattendue");
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { register, loading, error, setError };
}

// ── Authentication ───────────────────────────────────────────────────────────
export function useWebAuthnAuthenticate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticate = useCallback(async (email: string): Promise<any | null> => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get challenge from server
      const optRes = await fetch("/api/auth/webauthn/authenticate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!optRes.ok) {
        const err = await optRes.json();
        setError(err.error ?? "Aucun identifiant biométrique trouvé");
        return null;
      }
      const options = await optRes.json();

      // 2. Trigger biometric scan
      const assertion = await startAuthentication({ optionsJSON: options });

      // 3. Verify with server → get session
      const verifyRes = await fetch("/api/auth/webauthn/authenticate/finish", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, body: assertion }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        setError(err.error ?? "Authentification biométrique échouée");
        return null;
      }
      return await verifyRes.json();
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        setError("Authentification annulée ou expirée.");
      } else {
        setError(err?.message ?? "Erreur inattendue");
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { authenticate, loading, error, setError };
}
