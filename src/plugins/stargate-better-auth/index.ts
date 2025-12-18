/**
 * @module
 *
 * A Better Auth plugin that gates access based on whether users have starred
 * a GitHub repository. Useful for open source projects that want to encourage
 * stars in exchange for access to premium features or early releases.
 *
 * @example Server setup
 * ```typescript
 * import { betterAuth } from "better-auth";
 * import { githubStarGate } from "@d0x/stargate-better-auth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     githubStarGate({
 *       repository: "owner/repo",
 *       cacheDuration: 15,
 *     }),
 *   ],
 * });
 * ```
 *
 * @example Client usage
 * ```typescript
 * import { createAuthClient } from "better-auth/client";
 * import { githubStarGateClient } from "@d0x/stargate-better-auth/client";
 *
 * const client = createAuthClient({
 *   plugins: [githubStarGateClient()],
 * });
 *
 * const { hasStarred } = await client.starGate.checkStarStatus();
 * ```
 */

import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { APIError } from "better-auth/api";
import type { GitHubAccount, GitHubStarGateOptions, StarStatusResponse } from "./types";
import { starGateSchema } from "./schema";
import { StarVerificationCache } from "./cache";
import { GitHubStarVerifier } from "./verification";

export * from "./types";
export { starGateSchema } from "./schema";

/**
 * Creates a Better Auth plugin that requires users to star a GitHub repository
 * before granting access.
 *
 * The plugin verifies star status on sign-in and caches the result. It adds
 * two endpoints: `/star-gate/status` for checking current status and
 * `/star-gate/refresh` for forcing a re-check.
 *
 * @param options - Plugin configuration
 * @returns A Better Auth plugin
 */
export const githubStarGate = (options: GitHubStarGateOptions): BetterAuthPlugin => {
  if (!options.repository && !options.repositories) {
    throw new Error(
      "[stargate-better-auth] Either 'repository' or 'repositories' must be provided"
    );
  }

  let cache: StarVerificationCache;
  let verifier: GitHubStarVerifier;

  const log = (message: string) => {
    if (options.enableLogging === true) {
      console.log(`[stargate-better-auth] ${message}`);
    }
  };

  return {
    id: "stargate-better-auth",

    schema: starGateSchema,

    rateLimit: [
      {
        pathMatcher(path) {
          return path === "/star-gate/refresh";
        },
        window: 60,
        max: 5,
      },
      {
        pathMatcher(path) {
          return path === "/star-gate/status";
        },
        window: 60,
        max: 30,
      },
    ],

    init(ctx: any) {
      log("Initializing plugin...");
      
      cache = new StarVerificationCache(
        ctx.adapter,
        options.cacheDuration ?? 15
      );
      verifier = new GitHubStarVerifier(options, cache);

      log(`Repository: ${verifier.getRepositoryKey()}`);
      log(`Cache duration: ${options.cacheDuration ?? 15} minutes`);
      log(`API failure mode: ${options.onApiFailure ?? "allow"}`);
      log(`Grace period strategy: ${options.gracePeriod?.strategy ?? "immediate"}`);

      cache.cleanupExpired().then(count => {
        if (count > 0) {
          log(`Cleaned up ${count} expired cache entries`);
        }
      });
    },

    hooks: {
      after: [
        {
          matcher(context: any) {
            const isCallback = context.path === "/callback/:id" || 
              context.path.includes("/callback/github") ||
              context.path.includes("/callback");
            const isGitHubCallback = isCallback && context.params?.id === "github";
            const isSocialSignIn = context.path === "/sign-in/social" &&
                context.body?.provider === "github";
            return isGitHubCallback || isSocialSignIn;
          },
          handler: createAuthMiddleware(async (ctx: any) => {
            const newSession = ctx.context.newSession;
            if (!newSession) {
              return;
            }

            const user = newSession.user;
            const userId = user.id;

            log(`Verifying star status for user ${userId}`);

            const account = await ctx.context.adapter.findOne({
              model: "account",
              where: [
                { field: "userId", value: userId },
                { field: "providerId", value: "github" },
              ],
            });

            if (!account) {
              log(`No GitHub account found for user ${userId}`);
              throw new APIError("UNAUTHORIZED", {
                message: "GitHub account not linked",
                code: "GITHUB_ACCOUNT_NOT_FOUND",
              });
            }

            const githubAccount = account as GitHubAccount;
            if (!githubAccount.accessToken) {
              log(`No GitHub access token for user ${userId}`);
              throw new APIError("UNAUTHORIZED", {
                message: "GitHub access token not available",
                code: "GITHUB_TOKEN_MISSING",
              });
            }
            const githubToken = githubAccount.accessToken;

            const { hasStarred, requiresReauth } = await verifier.verifyStarStatus(
              userId,
              githubToken
            );

            if (requiresReauth) {
              await ctx.context.internalAdapter.deleteSession(newSession.session.token);
              throw new APIError("UNAUTHORIZED", {
                message: "GitHub token expired. Please sign in again.",
                code: "TOKEN_EXPIRED",
              });
            }

            log(`Star verification: ${hasStarred ? "STARRED" : "NOT STARRED"}`);

            const repoKey = verifier.getRepositoryKey();
            let verification = await cache.get(userId, repoKey);
            if (!verification) {
              verification = await cache.set(userId, repoKey, hasStarred);
            }

            const accessResult = verifier.shouldGrantAccess({
              hasStarred,
              accessGrantedAt: verification.accessGrantedAt,
              gracePeriodEndsAt: verification.gracePeriodEndsAt,
            });

            log(`Access: ${accessResult.granted ? "GRANTED" : "DENIED"}`);

            if (!accessResult.granted) {
              await ctx.context.internalAdapter.deleteSession(
                newSession.session.token
              );

              const errorMessage =
                options.customErrorMessages?.notStarred ||
                `Please star the repository ${repoKey} to access this application.`;

              throw new APIError("FORBIDDEN", {
                message: errorMessage,
                code: "STAR_REQUIRED",
              });
            }

            let gracePeriodEndsAt = verification.gracePeriodEndsAt;
            if (
              !hasStarred &&
              accessResult.gracePeriodActive &&
              !gracePeriodEndsAt &&
              verification.accessGrantedAt
            ) {
              gracePeriodEndsAt = verifier.calculateGracePeriodEnd(new Date());
              if (gracePeriodEndsAt) {
                await cache.setGracePeriodEnd(verification.id, gracePeriodEndsAt);
              }
            }

            await ctx.context.adapter.update({
              model: "session",
              where: [{ field: "id", value: newSession.session.id }],
              update: {
                hasStarAccess: true,
                starVerifiedAt: new Date(),
                gracePeriodActive: accessResult.gracePeriodActive,
              gracePeriodEndsAt: gracePeriodEndsAt,
            },
            });
          }),
        },
      ],
    },

    endpoints: {
      checkStarStatus: createAuthEndpoint(
        "/star-gate/status",
        {
          method: "GET",
        },
        async (ctx: any): Promise<Response> => {
          const session = await getSessionFromCtx(ctx);
          if (!session) {
            throw new APIError("UNAUTHORIZED", {
              message: "Not authenticated",
            });
          }

          const repoKey = verifier.getRepositoryKey();
          let verification = await cache.get(session.user.id, repoKey);
          
          const needsFetch = !verification || 
            !verification.expiresAt || 
            new Date() > new Date(verification.expiresAt);

          if (needsFetch) {
            const account = await ctx.context.adapter.findOne({
              model: "account",
              where: [
                { field: "userId", value: session.user.id },
                { field: "providerId", value: "github" },
              ],
            });

            const githubAccount = account as GitHubAccount | null;
            if (githubAccount?.accessToken) {
              await verifier.verifyStarStatus(
                session.user.id,
                githubAccount.accessToken
              );
              verification = await cache.get(session.user.id, repoKey);
            }
          }

          const response: StarStatusResponse = {
            hasStarred: verification?.hasStarred ?? false,
            lastChecked: verification?.lastCheckedAt,
            cacheExpires: verification?.expiresAt,
            gracePeriodActive: verification?.gracePeriodEndsAt
              ? new Date() < new Date(verification.gracePeriodEndsAt)
              : false,
            gracePeriodEnds: verification?.gracePeriodEndsAt ?? undefined,
            repository: repoKey,
          };

          return ctx.json(response);
        }
      ),

      refreshStarStatus: createAuthEndpoint(
        "/star-gate/refresh",
        {
          method: "POST",
        },
        async (ctx: any): Promise<Response> => {
          const session = await getSessionFromCtx(ctx);
          if (!session) {
            throw new APIError("UNAUTHORIZED", {
              message: "Not authenticated",
            });
          }

          const repoKey = verifier.getRepositoryKey();
          await cache.invalidate(session.user.id, repoKey);

          const account = await ctx.context.adapter.findOne({
            model: "account",
            where: [
              { field: "userId", value: session.user.id },
              { field: "providerId", value: "github" },
            ],
          });

          const githubAccount = account as GitHubAccount | null;
          if (!githubAccount?.accessToken) {
            throw new APIError("BAD_REQUEST", {
              message: "GitHub account not linked or token expired",
            });
          }

          const { hasStarred, error } = await verifier.verifyStarStatus(
            session.user.id,
            githubAccount.accessToken
          );

          return ctx.json({
            hasStarred,
            repository: repoKey,
            refreshedAt: new Date(),
            error,
          });
        }
      ),
    },

    $ERROR_CODES: {
      STAR_REQUIRED: "Repository star required for access",
      GITHUB_ACCOUNT_NOT_FOUND: "GitHub account not linked",
      GITHUB_TOKEN_MISSING: "GitHub access token not available",
      API_FAILURE: "GitHub API unavailable",
      GRACE_PERIOD_EXPIRED: "Grace period has expired",
      TOKEN_EXPIRED: "GitHub token expired, re-authentication required",
    },
  } as BetterAuthPlugin;
};
