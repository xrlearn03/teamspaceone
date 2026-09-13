import React from "react";
import ReactDOM from "react-dom/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { toastError, toastErrorThrottled } from "./lib/toast";
import "./styles/index.css";

const queryClient = new QueryClient({
  // Surface every failed mutation as a toast; query errors are throttled so
  // polling loops can't spam the same message.
  mutationCache: new MutationCache({
    onError: (error) => toastError(error),
  }),
  queryCache: new QueryCache({
    // Queries can opt out via meta.suppressErrorToast when the screen
    // already renders its own error state.
    onError: (error, query) => {
      if (query.meta?.suppressErrorToast) return;
      toastErrorThrottled(error);
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
