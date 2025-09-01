import { z } from 'zod';

export const emailSchema = z.string().email();
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

export const authSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type AuthInput = z.infer<typeof authSchema>;

