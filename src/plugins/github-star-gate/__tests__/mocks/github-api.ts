/**
 * Mock GitHub API responses for testing
 */

export const mockGitHubResponses = {
  /**
   * 204 No Content - User has starred the repository
   */
  starred: () =>
    new Response(null, {
      status: 204,
      headers: {
        "X-RateLimit-Remaining": "4999",
        "X-OAuth-Scopes": "read:user",
      },
    }),

  /**
   * 404 Not Found - User has NOT starred the repository
   */
  notStarred: () =>
    new Response(
      JSON.stringify({
        message: "Not Found",
        documentation_url:
          "https://docs.github.com/rest/activity/starring#check-if-a-repository-is-starred-by-the-authenticated-user",
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "4998",
          "X-OAuth-Scopes": "read:user",
        },
      }
    ),

  /**
   * 401 Unauthorized - Invalid or expired token
   */
  unauthorized: () =>
    new Response(
      JSON.stringify({
        message: "Bad credentials",
        documentation_url: "https://docs.github.com/rest",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      }
    ),

  /**
   * 403 Forbidden - Rate limited
   */
  rateLimited: () =>
    new Response(
      JSON.stringify({
        message:
          "API rate limit exceeded for user ID 123456. See https://docs.github.com/rest/rate-limit for details.",
        documentation_url: "https://docs.github.com/rest/rate-limit",
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600),
        },
      }
    ),

  /**
   * 403 Forbidden - Missing scopes
   */
  missingScopes: () =>
    new Response(
      JSON.stringify({
        message: "Resource not accessible by personal access token",
        documentation_url: "https://docs.github.com/rest",
      }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "4997",
          "X-OAuth-Scopes": "",
        },
      }
    ),

  /**
   * 500 Internal Server Error - GitHub is down
   */
  serverError: () =>
    new Response(
      JSON.stringify({
        message: "Internal Server Error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    ),
};

/**
 * Mock adapter for Better Auth database operations
 */
export function createMockAdapter() {
  const store = new Map<string, any>();

  return {
    store,

    findOne: async ({ model, where }: { model: string; where: any[] }) => {
      const key = where.map((w) => `${w.field}:${w.value}`).join("|");
      return store.get(`${model}:${key}`) || null;
    },

    findMany: async ({ model, where }: { model: string; where?: any[] }) => {
      const results: any[] = [];
      for (const [key, value] of store.entries()) {
        if (key.startsWith(`${model}:`)) {
          if (!where || where.length === 0) {
            results.push(value);
          } else {
            const matches = where.every((w) => {
              if (w.operator === "lt") {
                return new Date(value[w.field]) < new Date(w.value);
              }
              return value[w.field] === w.value;
            });
            if (matches) results.push(value);
          }
        }
      }
      return results;
    },

    create: async ({ model, data }: { model: string; data: any }) => {
      const where = [
        { field: "userId", value: data.userId },
        { field: "repository", value: data.repository },
      ];
      const key = where.map((w) => `${w.field}:${w.value}`).join("|");
      store.set(`${model}:${key}`, data);
      // Also store by ID for update/delete operations
      store.set(`${model}:id:${data.id}`, data);
      return data;
    },

    update: async ({
      model,
      where,
      update,
    }: {
      model: string;
      where: any[];
      update: any;
    }) => {
      // Handle ID-based lookup
      const idWhere = where.find((w) => w.field === "id");
      if (idWhere) {
        const existing = store.get(`${model}:id:${idWhere.value}`);
        if (existing) {
          const updated = { ...existing, ...update };
          store.set(`${model}:id:${idWhere.value}`, updated);
          // Update the main key as well
          const mainKey = `${model}:userId:${existing.userId}|repository:${existing.repository}`;
          store.set(mainKey, updated);
          return updated;
        }
      }
      return null;
    },

    delete: async ({ model, where }: { model: string; where: any[] }) => {
      const idWhere = where.find((w) => w.field === "id");
      if (idWhere) {
        const existing = store.get(`${model}:id:${idWhere.value}`);
        if (existing) {
          store.delete(`${model}:id:${idWhere.value}`);
          const mainKey = `${model}:userId:${existing.userId}|repository:${existing.repository}`;
          store.delete(mainKey);
        }
      }
    },

    clear: () => {
      store.clear();
    },
  };
}

/**
 * Test data factory
 */
export const testData = {
  userId: "test-user-123",
  repository: "sst/star-pay",
  githubToken: "gho_test_token_12345",

  createVerification: (overrides = {}) => ({
    id: crypto.randomUUID(),
    userId: testData.userId,
    repository: testData.repository,
    hasStarred: true,
    lastCheckedAt: new Date(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min from now
    createdAt: new Date(),
    accessGrantedAt: new Date(),
    accessRevokedAt: null,
    gracePeriodEndsAt: null,
    ...overrides,
  }),

  createExpiredVerification: (overrides = {}) => ({
    ...testData.createVerification(),
    expiresAt: new Date(Date.now() - 1000), // 1 second ago
    ...overrides,
  }),
};
