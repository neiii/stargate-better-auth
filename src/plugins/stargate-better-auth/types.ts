export interface GitHubAccount {
  id: string;
  userId: string;
  providerId: "github";
  accountId: string;
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  accessTokenExpiresAt?: Date;
}

export interface StarGateSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  hasStarAccess?: boolean;
  starVerifiedAt?: Date;
  gracePeriodActive?: boolean;
  gracePeriodEndsAt?: Date;
}

export interface BetterAuthAdapter {
  findOne<T = unknown>(options: {
    model: string;
    where: Array<{ field: string; value: unknown; operator?: string }>;
  }): Promise<T | null>;

  findMany<T = unknown>(options: {
    model: string;
    where?: Array<{ field: string; value?: unknown; operator?: string }>;
  }): Promise<T[]>;

  create<T = unknown>(options: {
    model: string;
    data: Record<string, unknown>;
  }): Promise<T>;

  update<T = unknown>(options: {
    model: string;
    where: Array<{ field: string; value: unknown }>;
    update: Record<string, unknown>;
  }): Promise<T>;

  delete(options: {
    model: string;
    where: Array<{ field: string; value: unknown }>;
  }): Promise<void>;
}

export type GracePeriodStrategy = "immediate" | "timed" | "never";

export interface RepositoryRequirement {
  owner: string;
  repo: string;
  displayName?: string;
}

export interface GitHubStarGateOptions {
  /**
   * Repository to check for stars
   * Can be a string "owner/repo" or a RepositoryRequirement object
   */
  repository: string | RepositoryRequirement;

  /**
   * Future: Support for multiple repositories
   * When implemented, will allow requiring stars on multiple repos
   */
  repositories?: {
    items: RepositoryRequirement[];
    logic: "ALL" | "ANY";
  };

  /**
   * How long to cache star verification results (in minutes)
   * @default 15
   */
  cacheDuration?: number;

  /**
   * What to do when GitHub API fails
   * - "allow": Grant access anyway (better UX)
   * - "deny": Deny access (more secure)
   * @default "allow"
   */
  onApiFailure?: "allow" | "deny";

  /**
   * Grace period configuration
   * Controls what happens when a user un-stars after being granted access
   */
  gracePeriod?: {
    /**
     * Strategy for handling un-stars
     * - "immediate": Revoke access on next verification
     * - "timed": Allow continued access for duration seconds
     * - "never": Once granted, never revoke (until session expires)
     * @default "immediate"
     */
    strategy: GracePeriodStrategy;
    
    /**
     * Duration in seconds (only used when strategy is "timed")
     * @default 3600 (1 hour)
     */
    duration?: number;
  };

  /**
   * Enable console logging for debugging
   * @default true in development
   */
  enableLogging?: boolean;

  /**
   * Custom error messages for various scenarios
   */
  customErrorMessages?: {
    notStarred?: string;
    apiFailure?: string;
    gracePeriodExpired?: string;
  };
}

export interface StarVerification {
  id: string;
  userId: string;
  repository: string;
  hasStarred: boolean;
  lastCheckedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  accessGrantedAt?: Date | null;
  accessRevokedAt?: Date | null;
  gracePeriodEndsAt?: Date | null;
  gracePeriodStartedAt?: Date | null;
}

export interface SessionWithStarAccess {
  hasStarAccess?: boolean;
  starVerifiedAt?: Date;
  gracePeriodActive?: boolean;
  gracePeriodEndsAt?: Date;
}

export interface VerificationResult {
  hasStarred: boolean;
  cached: boolean;
  error?: string;
  requiresReauth?: boolean;
}

export interface StarStatusResponse {
  hasStarred: boolean;
  lastChecked?: Date;
  cacheExpires?: Date;
  gracePeriodActive: boolean;
  gracePeriodEnds?: Date;
  repository: string;
}
