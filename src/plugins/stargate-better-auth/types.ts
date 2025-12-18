/** GitHub account as stored by Better Auth. */
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

/** Session with star gate fields added. */
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

/**
 * Strategy for handling access when a user un-stars:
 * - `immediate`: Revoke access on next check
 * - `timed`: Allow access for a configured duration after un-starring
 * - `never`: Once granted, never revoke (until session expires)
 */
export type GracePeriodStrategy = "immediate" | "timed" | "never";

/** Repository specification for star checking. */
export interface RepositoryRequirement {
  owner: string;
  repo: string;
  displayName?: string;
}

/** Configuration options for the star gate plugin. */
export interface GitHubStarGateOptions {
  /** Repository to check, either as `"owner/repo"` string or object. */
  repository: string | RepositoryRequirement;

  /** Multiple repositories (not yet implemented). */
  repositories?: {
    items: RepositoryRequirement[];
    logic: "ALL" | "ANY";
  };

  /** Cache duration in minutes. @default 15 */
  cacheDuration?: number;

  /** Behavior on GitHub API failure. @default "allow" */
  onApiFailure?: "allow" | "deny";

  /** Grace period when user un-stars after access was granted. */
  gracePeriod?: {
    strategy: GracePeriodStrategy;
    /** Duration in seconds (for `"timed"` strategy). @default 3600 */
    duration?: number;
  };

  /** Enable debug logging. */
  enableLogging?: boolean;

  /** Custom error messages. */
  customErrorMessages?: {
    notStarred?: string;
    apiFailure?: string;
    gracePeriodExpired?: string;
  };
}

/** Cached star verification record stored in the database. */
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

/** Result of a star verification check. */
export interface VerificationResult {
  hasStarred: boolean;
  cached: boolean;
  error?: string;
  requiresReauth?: boolean;
}

/** Response from the `/star-gate/status` endpoint. */
export interface StarStatusResponse {
  hasStarred: boolean;
  lastChecked?: Date;
  cacheExpires?: Date;
  gracePeriodActive: boolean;
  gracePeriodEnds?: Date;
  repository: string;
}
