import type { BetterAuthAdapter, StarVerification } from "./types";

export class StarVerificationCache {
  constructor(
    private adapter: BetterAuthAdapter,
    private cacheDurationMinutes: number = 15
  ) {}

  async get(
    userId: string,
    repository: string
  ): Promise<StarVerification | null> {
    const verification = await this.adapter.findOne<StarVerification>({
      model: "starVerification",
      where: [
        { field: "userId", value: userId },
        { field: "repository", value: repository },
      ],
    });

    if (!verification) return null;

    if (new Date(verification.expiresAt) < new Date()) {
      return null;
    }

    return verification;
  }

  async set(
    userId: string,
    repository: string,
    hasStarred: boolean,
    existingAccessGrantedAt?: Date | null
  ): Promise<StarVerification> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.cacheDurationMinutes * 60 * 1000
    );

    const existing = await this.adapter.findOne<StarVerification>({
      model: "starVerification",
      where: [
        { field: "userId", value: userId },
        { field: "repository", value: repository },
      ],
    });

    const accessGrantedAt = hasStarred
      ? existingAccessGrantedAt || existing?.accessGrantedAt || now
      : existing?.accessGrantedAt || null;

    if (existing) {
      return await this.adapter.update<StarVerification>({
        model: "starVerification",
        where: [{ field: "id", value: existing.id }],
        update: {
          hasStarred,
          lastCheckedAt: now,
          expiresAt,
          accessGrantedAt,
        },
      });
    } else {
      return await this.adapter.create<StarVerification>({
        model: "starVerification",
        data: {
          id: crypto.randomUUID(),
          userId,
          repository,
          hasStarred,
          lastCheckedAt: now,
          expiresAt,
          createdAt: now,
          accessGrantedAt: hasStarred ? now : null,
          accessRevokedAt: null,
          gracePeriodEndsAt: null,
        },
      });
    }
  }

  async setGracePeriodEnd(
    verificationId: string,
    gracePeriodEndsAt: Date
  ): Promise<void> {
    await this.adapter.update({
      model: "starVerification",
      where: [{ field: "id", value: verificationId }],
      update: { gracePeriodEndsAt },
    });
  }

  async markRevoked(verificationId: string): Promise<void> {
    await this.adapter.update({
      model: "starVerification",
      where: [{ field: "id", value: verificationId }],
      update: { accessRevokedAt: new Date() },
    });
  }

  async invalidate(userId: string, repository: string): Promise<void> {
    const existing = await this.adapter.findOne<StarVerification>({
      model: "starVerification",
      where: [
        { field: "userId", value: userId },
        { field: "repository", value: repository },
      ],
    });

    if (existing) {
      await this.adapter.delete({
        model: "starVerification",
        where: [{ field: "id", value: existing.id }],
      });
    }
  }

  async cleanupExpired(): Promise<number> {
    const expired = await this.adapter.findMany<StarVerification>({
      model: "starVerification",
      where: [
        { field: "expiresAt", operator: "lt", value: new Date() },
      ],
    });

    if (!expired || expired.length === 0) {
      return 0;
    }

    for (const record of expired) {
      await this.adapter.delete({
        model: "starVerification",
        where: [{ field: "id", value: record.id }],
      });
    }

    return expired.length;
  }
}
