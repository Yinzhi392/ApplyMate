import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "./AuthProvider";
import { AppRouter } from "./AppRouter";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: 5 * 60_000, refetchOnWindowFocus: true, retry: 1 },
    mutations: { retry: 0 },
  },
});

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
