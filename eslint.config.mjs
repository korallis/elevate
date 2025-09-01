// Flat config for the monorepo (ESLint v9)
import tseslint from 'typescript-eslint';
import { FlatCompat } from '@eslint/eslintrc';
import prettierPlugin from 'eslint-plugin-prettier';

const compat = new FlatCompat({ baseDirectory: process.cwd() });

export default tseslint.config(
  // Base TS (typescript-eslint recommended)
  ...tseslint.configs.recommended,
  // Repo-wide ignores
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/next-env.d.ts'],
  },
  // Next.js recommended (compat until flat config lands everywhere)
  ...compat.extends('next/core-web-vitals'),
  // Enable Prettier as a rule (no nested extends)
  {
    plugins: { prettier: prettierPlugin },
    rules: { 'prettier/prettier': 'error' },
  },
);
