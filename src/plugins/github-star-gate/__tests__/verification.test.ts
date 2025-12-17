import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubStarVerifier } from "../verification";
import { StarVerificationCache } from "../cache";
import {
  mockGitHubResponses,
  createMockAdapter,
  testData,
} from "./mocks/github-api";
import type { GitHubStarGateOptions } from "../types";

describe("GitHubStarVerifier", () => {
  let mockAdapter: ReturnType<typeof createMockAdapter>;
  let cache: StarVerificationCache;
  let verifier: GitHubStarVerifier;

  const defaultOptions: GitHubStarGateOptions = {
    repository: "sst/star-pay",
    enableLogging: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockAdapter();
    cache = new StarVerificationCache(mockAdapter, 15);
    verifier = new GitHubStarVerifier(defaultOptions, cache);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should parse string repository format", () => {
      const v = new GitHubStarVerifier({ repository: "owner/repo" }, cache);
      expect(v.getRepositoryKey()).toBe("owner/repo");
    });

    it("should accept object repository format", () => {
      const v = new GitHubStarVerifier(
        { repository: { owner: "myorg", repo: "myrepo" } },
        cache
      );
      expect(v.getRepositoryKey()).toBe("myorg/myrepo");
    });

    it("should throw on invalid repository string", () => {
      expect(() => {
        new GitHubStarVerifier({ repository: "invalid" }, cache);
      }).toThrow('Invalid repository format: invalid. Expected "owner/repo"');
    });
  });

  describe("verifyStarStatus", () => {
    it("should return true when user has starred (204 response)", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        mockGitHubResponses.starred()
      );

      const result = await verifier.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(true);
      expect(result.cached).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("should return false when user has not starred (404 response)", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        mockGitHubResponses.notStarred()
      );

      const result = await verifier.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(false);
      expect(result.cached).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("should return cached result when cache is valid", async () => {
      // Pre-populate cache with a valid verification
      const verification = testData.createVerification();
      await mockAdapter.create({
        model: "starVerification",
        data: verification,
      });

      const result = await verifier.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should call API when cache is expired", async () => {
      // Pre-populate cache with an expired verification
      const expiredVerification = testData.createExpiredVerification();
      await mockAdapter.create({
        model: "starVerification",
        data: expiredVerification,
      });

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(mockGitHubResponses.starred());

      const result = await verifier.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(fetchSpy).toHaveBeenCalled();
      expect(result.hasStarred).toBe(true);
      expect(result.cached).toBe(false);
    });

    it("should handle GitHub rate limiting (403) with allow fallback", async () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, onApiFailure: "allow" },
        cache
      );
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        mockGitHubResponses.rateLimited()
      );

      const result = await v.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(true);
      expect(result.cached).toBe(false);
      expect(result.error).toContain("403");
    });

    it("should handle GitHub rate limiting (403) with deny fallback", async () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, onApiFailure: "deny" },
        cache
      );
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        mockGitHubResponses.rateLimited()
      );

      const result = await v.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(false);
      expect(result.cached).toBe(false);
      expect(result.error).toContain("403");
    });

    it("should handle 401 unauthorized response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        mockGitHubResponses.unauthorized()
      );

      const result = await verifier.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(false);
      expect(result.cached).toBe(false);
      expect(result.error).toContain("authentication failed");
    });

    it("should handle network failures with allow fallback", async () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, onApiFailure: "allow" },
        cache
      );
      const networkError = new Error("Network error");
      vi.spyOn(global, "fetch")
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      const result = await v.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(true);
      expect(result.cached).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("should handle network failures with deny fallback", async () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, onApiFailure: "deny" },
        cache
      );
      const networkError = new Error("Network error");
      vi.spyOn(global, "fetch")
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      const result = await v.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(false);
      expect(result.cached).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("should default to allow fallback on network failure", async () => {
      const connectionError = new Error("Connection refused");
      vi.spyOn(global, "fetch")
        .mockRejectedValueOnce(connectionError)
        .mockRejectedValueOnce(connectionError)
        .mockRejectedValueOnce(connectionError);

      const result = await verifier.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(true);
      expect(result.error).toBe("Connection refused");
    });

    it("should retry and return server error after exhausting retries", async () => {
      vi.spyOn(global, "fetch")
        .mockResolvedValueOnce(mockGitHubResponses.serverError())
        .mockResolvedValueOnce(mockGitHubResponses.serverError())
        .mockResolvedValueOnce(mockGitHubResponses.serverError());

      const result = await verifier.verifyStarStatus(
        testData.userId,
        testData.githubToken
      );

      expect(result.hasStarred).toBe(true);
      expect(result.error).toContain("Unexpected GitHub API response: 500");
    });

    it("should make correct API call with headers", async () => {
      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValueOnce(mockGitHubResponses.starred());

      await verifier.verifyStarStatus(testData.userId, testData.githubToken);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.github.com/user/starred/sst/star-pay",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${testData.githubToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          }),
        })
      );
    });
  });

  describe("shouldGrantAccess", () => {
    it("should grant access when user has starred", () => {
      const result = verifier.shouldGrantAccess({ hasStarred: true });

      expect(result.granted).toBe(true);
      expect(result.reason).toBe("User has starred the repository");
      expect(result.gracePeriodActive).toBe(false);
    });

    it("should deny access immediately when strategy is immediate", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "immediate" } },
        cache
      );

      const result = v.shouldGrantAccess({ hasStarred: false });

      expect(result.granted).toBe(false);
      expect(result.reason).toBe("Star removed, immediate revocation");
      expect(result.gracePeriodActive).toBe(false);
    });

    it("should grant access with never strategy when previously granted", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "never" } },
        cache
      );

      const result = v.shouldGrantAccess({
        hasStarred: false,
        accessGrantedAt: new Date(),
      });

      expect(result.granted).toBe(true);
      expect(result.reason).toBe("Access previously granted, never revoke policy");
      expect(result.gracePeriodActive).toBe(true);
    });

    it("should deny access with never strategy when never granted", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "never" } },
        cache
      );

      const result = v.shouldGrantAccess({ hasStarred: false });

      expect(result.granted).toBe(false);
      expect(result.reason).toBe("Access was never granted");
    });

    it("should grant access during timed grace period", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "timed", duration: 3600 } },
        cache
      );

      const gracePeriodEndsAt = new Date(Date.now() + 1800 * 1000); // 30 min from now
      const result = v.shouldGrantAccess({
        hasStarred: false,
        accessGrantedAt: new Date(),
        gracePeriodEndsAt,
      });

      expect(result.granted).toBe(true);
      expect(result.gracePeriodActive).toBe(true);
    });

    it("should deny access after timed grace period expires", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "timed", duration: 3600 } },
        cache
      );

      const gracePeriodEndsAt = new Date(Date.now() - 1000); // 1 second ago
      const result = v.shouldGrantAccess({
        hasStarred: false,
        accessGrantedAt: new Date(Date.now() - 3700 * 1000),
        gracePeriodEndsAt,
      });

      expect(result.granted).toBe(false);
      expect(result.reason).toBe("Grace period expired");
      expect(result.gracePeriodActive).toBe(false);
    });

    it("should start grace period on first un-star detection", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "timed", duration: 3600 } },
        cache
      );

      const result = v.shouldGrantAccess({
        hasStarred: false,
        accessGrantedAt: new Date(),
        gracePeriodEndsAt: null,
      });

      expect(result.granted).toBe(true);
      expect(result.reason).toBe("Grace period starting now");
      expect(result.gracePeriodActive).toBe(true);
    });
  });

  describe("calculateGracePeriodEnd", () => {
    it("should return null for immediate strategy", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "immediate" } },
        cache
      );

      const result = v.calculateGracePeriodEnd(new Date());
      expect(result).toBeNull();
    });

    it("should return null for never strategy", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "never" } },
        cache
      );

      const result = v.calculateGracePeriodEnd(new Date());
      expect(result).toBeNull();
    });

    it("should calculate correct end date for timed strategy", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "timed", duration: 3600 } },
        cache
      );

      const now = new Date();
      const result = v.calculateGracePeriodEnd(now);

      expect(result).not.toBeNull();
      expect(result!.getTime()).toBe(now.getTime() + 3600 * 1000);
    });

    it("should use default duration of 3600 seconds", () => {
      const v = new GitHubStarVerifier(
        { ...defaultOptions, gracePeriod: { strategy: "timed" } },
        cache
      );

      const now = new Date();
      const result = v.calculateGracePeriodEnd(now);

      expect(result).not.toBeNull();
      expect(result!.getTime()).toBe(now.getTime() + 3600 * 1000);
    });
  });
});
