import React, { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const ReactQueryDevtools = import.meta.env.DEV
    ? lazy(() => import('@tanstack/react-query-devtools').then(m => ({ default: m.ReactQueryDevtools })))
    : null;
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});
export const QueryProvider = ({ children }: {
    children: React.ReactNode;
}) => (<QueryClientProvider client={queryClient}>
    {children}
    {ReactQueryDevtools && (<Suspense fallback={null}>
        <ReactQueryDevtools initialIsOpen={false}/>
      </Suspense>)}
  </QueryClientProvider>);
