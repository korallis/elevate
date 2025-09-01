import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  generateAccessToken,
  createPasswordResetToken,
  findPasswordResetToken,
  updateUserPassword,
  markPasswordResetTokenUsed,
  isValidPassword,
  getPasswordStrength,
} from '../auth.js';
import { requireAuth, getUser } from '../auth-middleware.js';
import { runPostgresQuery } from '../postgres.js';

const auth = new Hono();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional().default(false),
});

const signupSchema = z
  .object({
    name: z.string().min(1, 'Full name is required').max(100, 'Name too long'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    acceptTerms: z.boolean().refine((val) => val === true, 'You must accept the terms of service'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// POST /auth/login
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  try {
    const { email, password, remember } = c.req.valid('json');

    // Find user by email
    const user = await findUserByEmail(email.toLowerCase());
    if (!user || !user.password_hash) {
      return c.json({ error: 'Invalid email or password' }, 400);
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return c.json({ error: 'Invalid email or password' }, 400);
    }

    // Generate access token
    const accessToken = generateAccessToken(user);

    // Log successful login
    await runPostgresQuery('insert into audit_logs(actor, event, details) values($1, $2, $3)', [
      user.email,
      'user_login',
      { userId: user.id, remember },
    ]);

    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        email_verified: user.email_verified,
      },
      accessToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login failed' }, 500);
  }
});

// POST /auth/signup
auth.post('/signup', zValidator('json', signupSchema), async (c) => {
  try {
    const { name, email, password } = c.req.valid('json');

    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return c.json({ error: 'An account with this email already exists' }, 400);
    }

    // Validate password strength
    if (!isValidPassword(password)) {
      return c.json(
        {
          error: 'Password must be at least 8 characters with letters and numbers',
        },
        400,
      );
    }

    // Create new user
    const user = await createUser(normalizedEmail, password, name.trim());

    // Generate access token
    const accessToken = generateAccessToken(user);

    // Log successful signup
    await runPostgresQuery('insert into audit_logs(actor, event, details) values($1, $2, $3)', [
      user.email,
      'user_signup',
      { userId: user.id },
    ]);

    return c.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          email_verified: user.email_verified,
        },
        accessToken,
      },
      201,
    );
  } catch (error) {
    console.error('Signup error:', error);
    return c.json({ error: 'Account creation failed' }, 500);
  }
});

// POST /auth/logout
auth.post('/logout', requireAuth, async (c) => {
  try {
    const user = getUser(c);

    // Log logout
    if (user) {
      await runPostgresQuery('insert into audit_logs(actor, event, details) values($1, $2, $3)', [
        user.email,
        'user_logout',
        { userId: user.id },
      ]);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Logout failed' }, 500);
  }
});

// GET /auth/me
auth.get('/me', requireAuth, async (c) => {
  const user = getUser(c);
  return c.json({ user });
});

// POST /auth/forgot-password
auth.post('/forgot-password', zValidator('json', forgotPasswordSchema), async (c) => {
  try {
    const { email } = c.req.valid('json');

    const user = await findUserByEmail(email.toLowerCase());
    if (!user) {
      // Don't reveal if email exists or not for security
      return c.json({
        success: true,
        message:
          'If an account with that email exists, you will receive password reset instructions.',
      });
    }

    // Create password reset token
    const resetToken = await createPasswordResetToken(user.id);

    // In a real application, you would send an email here
    // For now, we'll log it and return it in the response (for development only)
    console.log(`Password reset token for ${user.email}: ${resetToken.token}`);

    // Log password reset request
    await runPostgresQuery('insert into audit_logs(actor, event, details) values($1, $2, $3)', [
      user.email,
      'password_reset_requested',
      { userId: user.id, tokenId: resetToken.id },
    ]);

    return c.json({
      success: true,
      message:
        'If an account with that email exists, you will receive password reset instructions.',
      // TODO: Remove this in production - only for development
      resetToken: process.env.NODE_ENV === 'development' ? resetToken.token : undefined,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return c.json({ error: 'Failed to process password reset request' }, 500);
  }
});

// POST /auth/reset-password
auth.post('/reset-password', zValidator('json', resetPasswordSchema), async (c) => {
  try {
    const { token, password } = c.req.valid('json');

    // Find valid reset token
    const resetToken = await findPasswordResetToken(token);
    if (!resetToken) {
      return c.json({ error: 'Invalid or expired reset token' }, 400);
    }

    // Validate new password
    if (!isValidPassword(password)) {
      return c.json(
        {
          error: 'Password must be at least 8 characters with letters and numbers',
        },
        400,
      );
    }

    // Update user password
    await updateUserPassword(resetToken.user_id, password);

    // Mark token as used
    await markPasswordResetTokenUsed(resetToken.id);

    // Log password reset
    const user = await runPostgresQuery('select email from users where id = $1', [
      resetToken.user_id,
    ]);
    const userEmail = user[0]?.email;

    if (userEmail) {
      await runPostgresQuery('insert into audit_logs(actor, event, details) values($1, $2, $3)', [
        userEmail,
        'password_reset_completed',
        { userId: resetToken.user_id, tokenId: resetToken.id },
      ]);
    }

    return c.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ error: 'Failed to reset password' }, 500);
  }
});

// GET /auth/password-strength
auth.post('/password-strength', async (c) => {
  try {
    const body = await c.req.json();
    const password = body?.password;

    if (!password || typeof password !== 'string') {
      return c.json({ error: 'Password is required' }, 400);
    }

    const strength = getPasswordStrength(password);
    return c.json(strength);
  } catch (error) {
    console.error('Password strength check error:', error);
    return c.json({ error: 'Failed to check password strength' }, 500);
  }
});

// OAuth placeholder endpoints (to be implemented with actual OAuth providers)
auth.get('/oauth/google', async (c) => {
  // TODO: Implement Google OAuth
  return c.json({ error: 'Google OAuth not yet implemented' }, 501);
});

auth.get('/oauth/microsoft', async (c) => {
  // TODO: Implement Microsoft OAuth
  return c.json({ error: 'Microsoft OAuth not yet implemented' }, 501);
});

auth.get('/oauth/callback', async (c) => {
  // TODO: Implement OAuth callback handler
  return c.json({ error: 'OAuth callback not yet implemented' }, 501);
});

export default auth;
