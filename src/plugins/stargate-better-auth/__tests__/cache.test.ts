import { describe, it, expect, vi, beforeEach } from "vitest";
import { StarVerificationCache } from "../cache";
import { createMockAdapter, testData } from "./mocks/github-api";

describe("StarVerificationCache", () => {
  let mockAdapter: ReturnType<typeof createMockAdapter>;
  let cache: StarVerificationCache;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockAdapter();
    cache = new StarVerificationCache(mockAdapter, 15);
  });

  describe("get()", () => {
    it("should return null for non-existent record", async () => {
      const result = await cache.get("non-existent-user", testData.repository);
      expect(result).toBeNull();
    });

    it("should return null for expired cache", async () => {
      // Create an expired verification
      const expiredVerification = testData.createExpiredVerification();
      await mockAdapter.create({
        model: "starVerification",
        data: expiredVerification,
      });

      const result = await cache.get(testData.userId, testData.repository);
      expect(result).toBeNull();
    });

    it("should return verification when cache is valid", async () => {
      const verification = testData.createVerification();
      await mockAdapter.create({
        model: "starVerification",
        data: verification,
      });

      const result = await cache.get(testData.userId, testData.repository);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe(testData.userId);
      expect(result!.repository).toBe(testData.repository);
      expect(result!.hasStarred).toBe(true);
    });
  });

  describe("set()", () => {
    it("should create new record when none exists", async () => {
      const result = await cache.set(
        testData.userId,
        testData.repository,
        true
      );

      expect(result.userId).toBe(testData.userId);
      expect(result.repository).toBe(testData.repository);
      expect(result.hasStarred).toBe(true);
      expect(result.accessGrantedAt).not.toBeNull();
    });

    it("should update existing record", async () => {
      // First create a record
      await cache.set(testData.userId, testData.repository, true);

      // Then update it
      const result = await cache.set(
        testData.userId,
        testData.repository,
        false
      );

      expect(result.hasStarred).toBe(false);
      // accessGrantedAt should be preserved from first set
      expect(result.accessGrantedAt).not.toBeNull();
    });

    it("should set accessGrantedAt to now when starring for first time", async () => {
      const beforeSet = new Date();
      const result = await cache.set(
        testData.userId,
        testData.repository,
        true
      );
      const afterSet = new Date();

      expect(result.accessGrantedAt).not.toBeNull();
      expect(new Date(result.accessGrantedAt!).getTime()).toBeGreaterThanOrEqual(
        beforeSet.getTime()
      );
      expect(new Date(result.accessGrantedAt!).getTime()).toBeLessThanOrEqual(
        afterSet.getTime()
      );
    });

    it("should set accessGrantedAt to null when not starred and never was", async () => {
      const result = await cache.set(
        testData.userId,
        testData.repository,
        false
      );

      expect(result.accessGrantedAt).toBeNull();
    });

    it("should preserve existing accessGrantedAt when updating", async () => {
      // First set with starred
      const firstResult = await cache.set(
        testData.userId,
        testData.repository,
        true
      );
      const originalAccessGrantedAt = firstResult.accessGrantedAt;

      // Wait a bit to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update to not starred
      const secondResult = await cache.set(
        testData.userId,
        testData.repository,
        false
      );

      // accessGrantedAt should be preserved
      expect(secondResult.accessGrantedAt).toEqual(originalAccessGrantedAt);
    });

    it("should set correct expiration time based on cacheDuration", async () => {
      const cacheDurationMinutes = 30;
      const customCache = new StarVerificationCache(mockAdapter, cacheDurationMinutes);

      const beforeSet = new Date();
      const result = await customCache.set(
        testData.userId,
        testData.repository,
        true
      );
      const afterSet = new Date();

      const expectedMinExpiry = beforeSet.getTime() + cacheDurationMinutes * 60 * 1000;
      const expectedMaxExpiry = afterSet.getTime() + cacheDurationMinutes * 60 * 1000;

      expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(expectedMinExpiry);
      expect(new Date(result.expiresAt).getTime()).toBeLessThanOrEqual(expectedMaxExpiry);
    });

    it("should use provided existingAccessGrantedAt when updating", async () => {
      await cache.set(testData.userId, testData.repository, false);
      
      const existingDate = new Date("2024-01-01T00:00:00Z");
      const result = await cache.set(
        testData.userId,
        testData.repository,
        true,
        existingDate
      );

      expect(result.accessGrantedAt).toEqual(existingDate);
    });
  });

  describe("invalidate()", () => {
    it("should delete existing record", async () => {
      // First create a record
      await cache.set(testData.userId, testData.repository, true);

      // Verify it exists
      let result = await cache.get(testData.userId, testData.repository);
      expect(result).not.toBeNull();

      // Invalidate
      await cache.invalidate(testData.userId, testData.repository);

      // Verify it's gone
      result = await cache.get(testData.userId, testData.repository);
      expect(result).toBeNull();
    });

    it("should not throw when record does not exist", async () => {
      // Should not throw
      await expect(
        cache.invalidate("non-existent", testData.repository)
      ).resolves.toBeUndefined();
    });
  });

  describe("setGracePeriodEnd()", () => {
    it("should update grace period end time", async () => {
      // First create a record
      const created = await cache.set(
        testData.userId,
        testData.repository,
        true
      );

      const gracePeriodEnd = new Date(Date.now() + 3600 * 1000);
      await cache.setGracePeriodEnd(created.id, gracePeriodEnd);

      // Verify the update (check the store directly since get() returns null for expired)
      const stored = mockAdapter.store.get(`starVerification:id:${created.id}`);
      expect(stored.gracePeriodEndsAt).toEqual(gracePeriodEnd);
    });
  });

  describe("markRevoked()", () => {
    it("should set accessRevokedAt timestamp", async () => {
      // First create a record
      const created = await cache.set(
        testData.userId,
        testData.repository,
        true
      );

      const beforeRevoke = new Date();
      await cache.markRevoked(created.id);
      const afterRevoke = new Date();

      // Verify the update
      const stored = mockAdapter.store.get(`starVerification:id:${created.id}`);
      expect(stored.accessRevokedAt).not.toBeNull();
      expect(new Date(stored.accessRevokedAt).getTime()).toBeGreaterThanOrEqual(
        beforeRevoke.getTime()
      );
      expect(new Date(stored.accessRevokedAt).getTime()).toBeLessThanOrEqual(
        afterRevoke.getTime()
      );
    });
  });

  describe("cache duration", () => {
    it("should use default cache duration of 15 minutes", async () => {
      const defaultCache = new StarVerificationCache(mockAdapter);
      const beforeSet = new Date();
      const result = await defaultCache.set(
        testData.userId,
        testData.repository,
        true
      );

      const expectedMinExpiry = beforeSet.getTime() + 15 * 60 * 1000;
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(
        expectedMinExpiry - 100 // allow 100ms tolerance
      );
    });

    it("should respect custom cache duration", async () => {
      const customCache = new StarVerificationCache(mockAdapter, 60);
      const beforeSet = new Date();
      const result = await customCache.set(
        testData.userId,
        testData.repository,
        true
      );

      const expectedMinExpiry = beforeSet.getTime() + 60 * 60 * 1000;
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThanOrEqual(
        expectedMinExpiry - 100
      );
    });
  });
});
