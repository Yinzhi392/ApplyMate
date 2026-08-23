import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, type PropsWithChildren } from "react";

import { callApi } from "../lib/api";
import { hasAuthenticatedIdentity } from "../lib/session";
import type { AuthStatus } from "../lib/models";
import { createRequestId } from "../lib/request-id";

interface AuthContextValue {
  authenticated: boolean;
  error: Error | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  status: AuthStatus | undefined;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren): React.JSX.Element {
  const openedTracked = useRef(false);
  const query = useQuery({
    queryKey: ["auth.status"],
    queryFn: async () => {
      const authenticated = await hasAuthenticatedIdentity();
      return {
        authenticated,
        status: authenticated
          ? await callApi<AuthStatus>("auth.status", {})
          : undefined,
      };
    },
    retry: 1,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (openedTracked.current || query.data?.status?.accessState !== "active") return;
    openedTracked.current = true;
    void callApi("analytics.track", { event: "app_opened" }, createRequestId()).catch(() => {
      openedTracked.current = false;
    });
  }, [query.data?.status?.accessState]);
  return (
    <AuthContext.Provider value={{
      authenticated: query.data?.authenticated ?? false,
      error: query.error,
      loading: query.isLoading,
      refresh: query.refetch,
      status: query.data?.status,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === undefined) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
