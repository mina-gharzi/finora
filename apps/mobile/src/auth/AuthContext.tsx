import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { loginMobile } from "../lib/api.ts";
import {
  deleteStoredSession,
  readStoredSession,
  writeStoredSession,
  type StoredMobileSession,
} from "../lib/session-storage.ts";

type AuthState =
  | { status: "restoring" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: StoredMobileSession };

interface AuthContextValue {
  status: AuthState["status"];
  session: StoredMobileSession | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutUnauthorized: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "restoring" });

  useEffect(() => {
    let active = true;

    void readStoredSession()
      .then((session) => {
        if (!active) return;
        setState(session ? { status: "signedIn", session } : { status: "signedOut" });
      })
      .catch(() => {
        if (active) setState({ status: "signedOut" });
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await loginMobile(email, password);
    const session: StoredMobileSession = {
      token: response.token,
      expiresAt: response.expiresAt,
      user: response.user,
    };
    await writeStoredSession(session);
    setState({ status: "signedIn", session });
  }, []);

  const signOut = useCallback(async () => {
    await deleteStoredSession();
    setState({ status: "signedOut" });
  }, []);

  const signOutUnauthorized = useCallback(async () => {
    try {
      await deleteStoredSession();
    } catch {
      // Still drop the in-memory session; the next startup request will
      // receive 401 again if the stale token could not be deleted.
    } finally {
      setState({ status: "signedOut" });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      session: state.status === "signedIn" ? state.session : null,
      signIn,
      signOut,
      signOutUnauthorized,
    }),
    [state, signIn, signOut, signOutUnauthorized],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
