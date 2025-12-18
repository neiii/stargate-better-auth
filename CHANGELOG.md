# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-18

### Added

- Initial release
- `githubStarGate` server plugin for Better Auth
- `githubStarGateClient` client plugin
- Star verification with configurable caching
- Grace period strategies: `immediate`, `timed`, `never`
- API endpoints: `/star-gate/status`, `/star-gate/refresh`
- Rate limiting on endpoints
- Configurable failure modes (`allow`/`deny`)
- Custom error messages support
- Full TypeScript support with ESM and CJS builds
