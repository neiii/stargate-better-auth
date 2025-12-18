# github-star-gate

[![CI](https://github.com/neiii/stargate-better-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/neiii/stargate-better-auth/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/github-star-gate.svg)](https://www.npmjs.com/package/github-star-gate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A [Better Auth](https://github.com/better-auth/better-auth) plugin that gates application access based on GitHub repository stars.

## Why Star Gate?

- **Growth hack**: Incentivize users to star your repo in exchange for access
- **Community building**: Create exclusive features for supporters
- **Lightweight**: No external services, just GitHub's API
- **Flexible**: Configurable caching, grace periods, and failure modes

## Installation

```bash
npm install github-star-gate
# or
bun add github-star-gate
# or
pnpm add github-star-gate
```

## Requirements

- [Better Auth](https://github.com/better-auth/better-auth) ^1.2.0
- GitHub OAuth configured in Better Auth

## Quick Start

### Server

```typescript
import { betterAuth } from "better-auth";
import { githubStarGate } from "github-star-gate";

export const auth = betterAuth({
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  },
  plugins: [
    githubStarGate({
      repository: "owner/repo",
    }),
  ],
});
```

### Client

```typescript
import { createAuthClient } from "better-auth/client";
import { githubStarGateClient } from "github-star-gate/client";

const client = createAuthClient({
  plugins: [githubStarGateClient()],
});

// Check status
const { hasStarred } = await client.starGate.checkStarStatus();

// Force refresh
await client.starGate.refreshStarStatus();
```

## Configuration

```typescript
githubStarGate({
  // Required: repository to check
  repository: "owner/repo",

  // Cache duration in minutes (default: 15)
  cacheDuration: 15,

  // What to do when GitHub API fails (default: "allow")
  onApiFailure: "allow" | "deny",

  // Grace period when user un-stars (default: immediate revocation)
  gracePeriod: {
    strategy: "immediate" | "timed" | "never",
    duration: 3600, // seconds, for "timed" strategy
  },

  // Debug logging (default: false)
  enableLogging: false,

  // Custom error messages
  customErrorMessages: {
    notStarred: "Please star our repo to continue.",
  },
})
```

## API Endpoints

### GET /api/auth/star-gate/status

Returns current star status.

```json
{
  "hasStarred": true,
  "repository": "owner/repo",
  "lastChecked": "2025-01-15T10:30:00Z",
  "cacheExpires": "2025-01-15T10:45:00Z",
  "gracePeriodActive": false
}
```

### POST /api/auth/star-gate/refresh

Force refresh from GitHub API (rate limited: 5/min).

```json
{
  "hasStarred": true,
  "repository": "owner/repo",
  "refreshedAt": "2025-01-15T10:35:00Z"
}
```

## Grace Period Strategies

| Strategy | Behavior |
|----------|----------|
| `immediate` | Revoke access immediately when star is removed |
| `timed` | Allow continued access for `duration` seconds after un-star |
| `never` | Never revoke once granted (until session expires) |

## Error Codes

| Code | Description |
|------|-------------|
| `STAR_REQUIRED` | User hasn't starred the repository |
| `GITHUB_ACCOUNT_NOT_FOUND` | No GitHub account linked |
| `GITHUB_TOKEN_MISSING` | GitHub token unavailable |
| `TOKEN_EXPIRED` | GitHub token expired, re-auth required |
| `API_FAILURE` | GitHub API unavailable |

## Database Schema

The plugin adds a `starVerification` table:

| Column | Type | Description |
|--------|------|-------------|
| userId | string | Foreign key to user |
| repository | string | Repository being verified |
| hasStarred | boolean | Current star status |
| lastCheckedAt | datetime | Last verification time |
| expiresAt | datetime | Cache expiration |

Session fields added: `hasStarAccess`, `starVerifiedAt`, `gracePeriodActive`.

## Rate Limits

- `/star-gate/status`: 30 requests/minute
- `/star-gate/refresh`: 5 requests/minute

GitHub API: 5000 requests/hour per token. With 15-minute caching, supports ~333 users/minute.

## Troubleshooting

### "GITHUB_ACCOUNT_NOT_FOUND"

User signed in with a different provider. They need to link their GitHub account or sign in with GitHub.

### "TOKEN_EXPIRED"

The stored GitHub OAuth token has expired. User needs to re-authenticate with GitHub.

### API rate limiting

If you're hitting GitHub's rate limits:
1. Increase `cacheDuration` (e.g., 30 or 60 minutes)
2. Set `onApiFailure: "allow"` to gracefully degrade

## Contributing

```bash
git clone https://github.com/neiii/stargate-better-auth
cd stargate-better-auth
bun install
bun test
```

## License

MIT © [d0](https://github.com/neiii)
