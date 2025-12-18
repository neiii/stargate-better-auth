import type { BetterAuthClientPlugin } from "better-auth/client";
import type { StarStatusResponse } from "./types";
import type { githubStarGate } from "./index";

type RefreshResponse = {
  hasStarred: boolean;
  repository: string;
  refreshedAt: Date;
  error?: string;
};

export const githubStarGateClient = (): BetterAuthClientPlugin => {
  return {
    id: "stargate-better-auth",
    $InferServerPlugin: {} as ReturnType<typeof githubStarGate>,

    getActions: ($fetch: any) => ({
      checkStarStatus: async (): Promise<StarStatusResponse> => {
        const response = await $fetch("/star-gate/status", {
          method: "GET",
        });
        return response.data as StarStatusResponse;
      },

      refreshStarStatus: async (): Promise<RefreshResponse> => {
        const response = await $fetch("/star-gate/refresh", {
          method: "POST",
        });
        return response.data as RefreshResponse;
      },
    }),

    pathMethods: {
      "/star-gate/status": "GET",
      "/star-gate/refresh": "POST",
    },

    atomListeners: [
      {
        matcher(path) {
          return path === "/star-gate/refresh";
        },
        signal: "$sessionSignal",
      },
    ],
  } satisfies BetterAuthClientPlugin;
};
