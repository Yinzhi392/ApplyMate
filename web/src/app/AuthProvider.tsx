import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, type PropsWithChildren } from "react";

import { callApi } from "../lib/api";
import type { AuthStatus } from "../lib/models";
import { createRequestId } from "../lib/request-id";

interface AuthContextValue {
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
    queryFn: () => callApi<AuthStatus>("auth.status", {}),
    retry: 1,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (openedTracked.current || query.data?.accessState !== "active") return;
    openedTracked.current = true;
    void callApi("analytics.track", { event: "app_opened" }, createRequestId()).catch(() => {
      openedTracked.current = false;
    });
  }, [query.data?.accessState]);
  return (
    <AuthContext.Provider value={{
      error: query.error,
      loading: query.isLoading,
      refresh: query.refetch,
      status: query.data,
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
