"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { toastError, toastErrorThrottled } from "@/lib/toast";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Surface every failed mutation as a toast; query errors are
        // throttled so polling loops can't spam the same message.
        mutationCache: new MutationCache({
          onError: (error) => toastError(error),
        }),
        queryCache: new QueryCache({
          onError: (error) => toastErrorThrottled(error),
        }),
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
