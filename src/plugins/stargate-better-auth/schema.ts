export const starGateSchema = {
  starVerification: {
    fields: {
      id: {
        type: "string",
        required: true,
      },
      userId: {
        type: "string",
        required: true,
        index: true,
        references: {
          model: "user",
          field: "id",
          onDelete: "cascade",
        },
      },
      repository: {
        type: "string",
        required: true,
        index: true,
      },
      hasStarred: {
        type: "boolean",
        required: true,
      },
      lastCheckedAt: {
        type: "date",
        required: true,
      },
      expiresAt: {
        type: "date",
        required: true,
        index: true,
      },
      createdAt: {
        type: "date",
        required: true,
      },
      accessGrantedAt: {
        type: "date",
        required: false,
      },
      accessRevokedAt: {
        type: "date",
        required: false,
      },
      gracePeriodEndsAt: {
        type: "date",
        required: false,
      },
      gracePeriodStartedAt: {
        type: "date",
        required: false,
      },
    },
  },
  session: {
    fields: {
      hasStarAccess: {
        type: "boolean",
        required: false,
      },
      starVerifiedAt: {
        type: "date",
        required: false,
      },
      gracePeriodActive: {
        type: "boolean",
        required: false,
      },
      gracePeriodEndsAt: {
        type: "date",
        required: false,
      },
    },
  },
  user: {
    fields: {
      githubId: {
        type: "string",
        required: false,
      },
      githubUsername: {
        type: "string",
        required: false,
      },
    },
  },
} as const;

export type StarGateSchema = typeof starGateSchema;
