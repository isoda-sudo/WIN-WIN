import {
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import SuperJSON from "superjson";

const DEFAULT_STALE_TIME_SECONDS = 30;
const MILLISECONDS_PER_SECOND = 1000;

export const createQueryClient = () =>
  new QueryClient({
    // 排他制御（他の人が編集中）で更新が拒否されたときは、理由を必ず表示する
    mutationCache: new MutationCache({
      onError: (error) => {
        const message = (error as { message?: string }).message ?? "";
        const code = (error as { data?: { code?: string } }).data?.code;
        if (code === "FORBIDDEN" && message.includes("編集中")) {
          toast.error(message, { id: "edit-lock-denied" });
        }
      },
    }),
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: DEFAULT_STALE_TIME_SECONDS * MILLISECONDS_PER_SECOND,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
