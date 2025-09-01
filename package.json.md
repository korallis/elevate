# Path: package.json

```json
{
  "name": "sme-analytics",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@9",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "setup": "bash ./scripts/setup.sh",
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "@types/node": "latest",
    "turbo": "latest",
    "typescript": "latest",
    "prettier": "latest",
    "eslint": "latest"
  },
  "workspaces": ["apps/*", "packages/*"]
}
```
