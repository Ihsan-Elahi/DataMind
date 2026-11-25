import { useMemo, useState } from "react";
import { api } from "../api";
import {
  clearSession,
  getSession,
  saveSession,
} from "../services/authService";
import { AuthContext } from "./authContext";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(getSession);

  async function signIn(credentials) {
    const response = await api.login(credentials);
    const nextSession = {
      token: response.access_token || response.token,
      user: response.user || {
        id: response.user_id || credentials.email.toLowerCase(),
        email: credentials.email,
        name: response.name || credentials.email.split("@")[0],
      },
    };
    if (!nextSession.token) {
      throw new Error("The service returned an invalid sign-in response.");
    }
    saveSession(nextSession);
    setSession(nextSession);
  }

  async function signUp(details) {
    let response = await api.register(details);
    if (!response?.access_token && !response?.token) {
      response = await api.login(details);
    }
    const nextSession = {
      token: response.access_token || response.token,
      user: response.user || {
        id: response.user_id || details.email.toLowerCase(),
        email: details.email,
        name: response.name || details.name,
      },
    };
    if (!nextSession.token) {
      throw new Error("The service returned an invalid registration response.");
    }
    saveSession(nextSession);
    setSession(nextSession);
  }

  function signOut() {
    clearSession();
    setSession(null);
  }

  const value = useMemo(
    () => ({ session, user: session?.user || null, signIn, signUp, signOut }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
