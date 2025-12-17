import type {
  GitHubStarGateOptions,
  RepositoryRequirement,
  VerificationResult,
} from "./types";
import type { StarVerificationCache } from "./cache";

export class GitHubStarVerifier {
  private repository: RepositoryRequirement;
  private repoKey: string;
  private pendingVerifications = new Map<string, Promise<VerificationResult>>();

  constructor(
    private options: GitHubStarGateOptions,
    private cache: StarVerificationCache
  ) {
    // Parse repository string or object
    if (typeof options.repository === "string") {
      const [owner, repo] = options.repository.split("/");
      if (!owner || !repo) {
        throw new Error(
          `Invalid repository format: ${options.repository}. Expected "owner/repo"`
        );
      }
      this.repository = { owner, repo };
    } else {
      this.repository = options.repository;
    }
    this.repoKey = `${this.repository.owner}/${this.repository.repo}`;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        if (response.status < 500 && response.status !== 429) {
          return response;
        }

        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
          this.log(`GitHub API returned ${response.status}, retrying in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          return response; // Return last response if all retries exhausted
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          this.log(`Network error, retrying in ${delay}ms: ${lastError.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  getRepositoryKey(): string {
    return this.repoKey;
  }

  async verifyStarStatus(
    userId: string,
    githubAccessToken: string
  ): Promise<VerificationResult> {
    const coalescingKey = `${userId}:${this.repoKey}`;

    const pending = this.pendingVerifications.get(coalescingKey);
    if (pending) {
      this.log(`Coalescing request for user ${userId}`);
      return pending;
    }

    const verificationPromise = this._doVerifyStarStatus(userId, githubAccessToken);
    this.pendingVerifications.set(coalescingKey, verificationPromise);

    try {
      return await verificationPromise;
    } finally {
      this.pendingVerifications.delete(coalescingKey);
    }
  }

  private async _doVerifyStarStatus(
    userId: string,
    githubAccessToken: string
  ): Promise<VerificationResult> {
    const cached = await this.cache.get(userId, this.repoKey);
    if (cached) {
      this.log(`Cache hit for user ${userId}: ${cached.hasStarred}`);
      return { hasStarred: cached.hasStarred, cached: true };
    }

    const apiUrl = `https://api.github.com/user/starred/${this.repository.owner}/${this.repository.repo}`;
    this.log(`Cache miss for user ${userId}`);

    try {
      const response = await this.fetchWithRetry(apiUrl, {
        headers: {
          Authorization: `Bearer ${githubAccessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "star-pay-better-auth-plugin",
        },
      });

      this.log(`GitHub API response: ${response.status}`);

      if (response.status === 204) {
        await this.cache.set(userId, this.repoKey, true);
        return { hasStarred: true, cached: false };
      } else if (response.status === 404) {
        await this.cache.set(userId, this.repoKey, false);
        return { hasStarred: false, cached: false };
      } else if (response.status === 401) {
        this.log(`GitHub auth failed for user ${userId}`);
        return {
          hasStarred: false,
          cached: false,
          error: "GitHub authentication failed. Token may be expired.",
          requiresReauth: true,
        };
      } else if (response.status === 403) {
        this.log(`GitHub API rate limited for user ${userId}`);
        return {
          hasStarred: this.options.onApiFailure === "allow",
          cached: false,
          error: `GitHub API rate limit or permission issue (status: 403)`,
        };
      } else {
        this.log(`Unexpected GitHub API response: ${response.status}`);
        throw new Error(`Unexpected GitHub API response: ${response.status}`);
      }
    } catch (error) {
      const onApiFailure = this.options.onApiFailure ?? "allow";
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.log(`GitHub API error: ${errorMessage}. Using fallback: ${onApiFailure}`);

      return {
        hasStarred: onApiFailure === "allow",
        cached: false,
        error: errorMessage,
      };
    }
  }

  shouldGrantAccess(verification: {
    hasStarred: boolean;
    accessGrantedAt?: Date | null;
    gracePeriodEndsAt?: Date | null;
    gracePeriodStartedAt?: Date | null;
  }): { granted: boolean; reason: string; gracePeriodActive: boolean } {
    if (verification.hasStarred) {
      return {
        granted: true,
        reason: "User has starred the repository",
        gracePeriodActive: false,
      };
    }

    const strategy = this.options.gracePeriod?.strategy ?? "immediate";

    switch (strategy) {
      case "immediate":
        return {
          granted: false,
          reason: "Star removed, immediate revocation",
          gracePeriodActive: false,
        };

      case "never":
        if (verification.accessGrantedAt) {
          return {
            granted: true,
            reason: "Access previously granted, never revoke policy",
            gracePeriodActive: true,
          };
        }
        return {
          granted: false,
          reason: "Access was never granted",
          gracePeriodActive: false,
        };

      case "timed":
        if (verification.gracePeriodStartedAt) {
          const durationMs = (this.options.gracePeriod?.duration ?? 3600) * 1000;
          const endsAt = new Date(new Date(verification.gracePeriodStartedAt).getTime() + durationMs);
          
          if (new Date() < endsAt) {
            return {
              granted: true,
              reason: `Grace period active until ${endsAt.toISOString()}`,
              gracePeriodActive: true,
            };
          }
          return {
            granted: false,
            reason: "Grace period expired",
            gracePeriodActive: false,
          };
        }
        // Fallback to existing gracePeriodEndsAt logic for backwards compatibility
        if (verification.gracePeriodEndsAt) {
          const now = new Date();
          if (now < new Date(verification.gracePeriodEndsAt)) {
            return {
              granted: true,
              reason: `Grace period active until ${verification.gracePeriodEndsAt}`,
              gracePeriodActive: true,
            };
          }
        }
        // Grace period expired or not set - check if we should start one
        if (verification.accessGrantedAt && !verification.gracePeriodEndsAt && !verification.gracePeriodStartedAt) {
          return {
            granted: true,
            reason: "Grace period starting now",
            gracePeriodActive: true,
          };
        }
        return {
          granted: false,
          reason: "Grace period expired",
          gracePeriodActive: false,
        };

      default:
        return {
          granted: false,
          reason: "Unknown grace period strategy",
          gracePeriodActive: false,
        };
    }
  }

  calculateGracePeriodEnd(fromDate: Date): Date | null {
    const strategy = this.options.gracePeriod?.strategy ?? "immediate";

    if (strategy === "timed") {
      const durationSeconds = this.options.gracePeriod?.duration ?? 3600;
      return new Date(fromDate.getTime() + durationSeconds * 1000);
    }

    return null;
  }

  private log(message: string): void {
    if (this.options.enableLogging === true) {
      console.log(`[github-star-gate] ${message}`);
    }
  }
}
