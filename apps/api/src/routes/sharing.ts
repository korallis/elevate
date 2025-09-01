import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, getUser } from '../auth-middleware.js';
import { runPostgresQuery } from '../postgres.js';
import { randomBytes } from 'crypto';

const sharing = new Hono();

// Validation schemas
const shareResourceSchema = z.object({
  resourceType: z.enum(['dashboard', 'query', 'report', 'dataset', 'table']),
  resourceId: z.string().min(1, 'Resource ID is required'),
  shareType: z.enum(['user', 'department', 'organization']),
  shareWithId: z.number().int().positive('Invalid recipient ID'),
  permissions: z.array(z.enum(['view', 'edit', 'admin'])).min(1, 'At least one permission required'),
});

const updateShareSchema = z.object({
  permissions: z.array(z.enum(['view', 'edit', 'admin'])).min(1, 'At least one permission required'),
});

const inviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['viewer', 'editor', 'admin']).default('viewer'),
  orgId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  resourceType: z.enum(['dashboard', 'query', 'report', 'dataset', 'table']).optional(),
  resourceId: z.string().optional(),
  message: z.string().max(500, 'Message too long').optional(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
});

// POST /sharing/share - Create new share
sharing.post('/share', requireAuth, zValidator('json', shareResourceSchema), async (c) => {
  try {
    const user = getUser(c);
    const { resourceType, resourceId, shareType, shareWithId, permissions } = c.req.valid('json');

    // Check if user has permission to share this resource
    // In a real application, you'd implement resource ownership/permission checking
    // For now, we'll allow any authenticated user to share

    // Check if share already exists
    const existingShare = await runPostgresQuery<{ id: number }>(
      'SELECT id FROM resource_shares WHERE resource_type = $1 AND resource_id = $2 AND share_type = $3 AND share_with_id = $4',
      [resourceType, resourceId, shareType, shareWithId]
    );

    if (existingShare.length > 0) {
      return c.json({ error: 'Resource is already shared with this recipient' }, 400);
    }

    // Validate that the recipient exists
    let recipientQuery: string;
    switch (shareType) {
      case 'user':
        recipientQuery = 'SELECT id FROM users WHERE id = $1';
        break;
      case 'department':
        recipientQuery = 'SELECT id FROM departments WHERE id = $1';
        break;
      case 'organization':
        recipientQuery = 'SELECT id FROM orgs WHERE id = $1';
        break;
    }

    const recipient = await runPostgresQuery(recipientQuery, [shareWithId]);
    if (recipient.length === 0) {
      return c.json({ error: 'Recipient not found' }, 404);
    }

    // Create the share
    const share = await runPostgresQuery<{
      id: number;
      resource_type: string;
      resource_id: string;
      share_type: string;
      share_with_id: number;
      permissions: string[];
      created_by: number;
      created_at: string;
    }>(
      `INSERT INTO resource_shares (resource_type, resource_id, share_type, share_with_id, permissions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, resource_type, resource_id, share_type, share_with_id, permissions, created_by, created_at`,
      [resourceType, resourceId, shareType, shareWithId, JSON.stringify(permissions), user.id]
    );

    // Log the sharing action
    await runPostgresQuery('INSERT INTO audit_logs(actor, event, details) VALUES($1, $2, $3)', [
      user.email,
      'resource_shared',
      {
        shareId: share[0].id,
        resourceType,
        resourceId,
        shareType,
        shareWithId,
        permissions,
      },
    ]);

    return c.json({
      success: true,
      share: share[0],
    });
  } catch (error) {
    console.error('Share creation error:', error);
    return c.json({ error: 'Failed to create share' }, 500);
  }
});

// GET /sharing/:resourceType/:resourceId - Get shares for resource
sharing.get('/:resourceType/:resourceId', requireAuth, async (c) => {
  try {
    const resourceType = c.req.param('resourceType');
    const resourceId = c.req.param('resourceId');

    // Validate resourceType
    const validResourceTypes = ['dashboard', 'query', 'report', 'dataset', 'table'];
    if (!validResourceTypes.includes(resourceType)) {
      return c.json({ error: 'Invalid resource type' }, 400);
    }

    // Get all shares for this resource with recipient details
    const shares = await runPostgresQuery<{
      id: number;
      resource_type: string;
      resource_id: string;
      share_type: string;
      share_with_id: number;
      permissions: string[];
      created_by: number;
      created_at: string;
      recipient_name: string;
      recipient_email?: string;
    }>(
      `SELECT 
        rs.*,
        CASE 
          WHEN rs.share_type = 'user' THEN u.name
          WHEN rs.share_type = 'department' THEN d.name
          WHEN rs.share_type = 'organization' THEN o.name
        END as recipient_name,
        CASE 
          WHEN rs.share_type = 'user' THEN u.email
        END as recipient_email
      FROM resource_shares rs
      LEFT JOIN users u ON rs.share_type = 'user' AND rs.share_with_id = u.id
      LEFT JOIN departments d ON rs.share_type = 'department' AND rs.share_with_id = d.id
      LEFT JOIN orgs o ON rs.share_type = 'organization' AND rs.share_with_id = o.id
      WHERE rs.resource_type = $1 AND rs.resource_id = $2
      ORDER BY rs.created_at DESC`,
      [resourceType, resourceId]
    );

    return c.json({
      success: true,
      shares,
    });
  } catch (error) {
    console.error('Get shares error:', error);
    return c.json({ error: 'Failed to retrieve shares' }, 500);
  }
});

// PUT /sharing/:shareId - Update share permissions
sharing.put('/:shareId', requireAuth, zValidator('json', updateShareSchema), async (c) => {
  try {
    const user = getUser(c);
    const shareId = parseInt(c.req.param('shareId'));
    const { permissions } = c.req.valid('json');

    if (isNaN(shareId)) {
      return c.json({ error: 'Invalid share ID' }, 400);
    }

    // Check if share exists and user has permission to modify it
    const existingShare = await runPostgresQuery<{
      id: number;
      created_by: number;
      resource_type: string;
      resource_id: string;
    }>(
      'SELECT id, created_by, resource_type, resource_id FROM resource_shares WHERE id = $1',
      [shareId]
    );

    if (existingShare.length === 0) {
      return c.json({ error: 'Share not found' }, 404);
    }

    // For now, only allow the creator to modify shares
    // In a real application, you'd implement more sophisticated permission checking
    if (existingShare[0].created_by !== user.id) {
      return c.json({ error: 'You do not have permission to modify this share' }, 403);
    }

    // Update the share
    const updatedShare = await runPostgresQuery<{
      id: number;
      permissions: string[];
      updated_at: string;
    }>(
      'UPDATE resource_shares SET permissions = $1, updated_at = NOW() WHERE id = $2 RETURNING id, permissions, updated_at',
      [JSON.stringify(permissions), shareId]
    );

    // Log the update action
    await runPostgresQuery('INSERT INTO audit_logs(actor, event, details) VALUES($1, $2, $3)', [
      user.email,
      'resource_share_updated',
      {
        shareId,
        newPermissions: permissions,
        resourceType: existingShare[0].resource_type,
        resourceId: existingShare[0].resource_id,
      },
    ]);

    return c.json({
      success: true,
      share: updatedShare[0],
    });
  } catch (error) {
    console.error('Update share error:', error);
    return c.json({ error: 'Failed to update share' }, 500);
  }
});

// DELETE /sharing/:shareId - Revoke share
sharing.delete('/:shareId', requireAuth, async (c) => {
  try {
    const user = getUser(c);
    const shareId = parseInt(c.req.param('shareId'));

    if (isNaN(shareId)) {
      return c.json({ error: 'Invalid share ID' }, 400);
    }

    // Check if share exists and user has permission to delete it
    const existingShare = await runPostgresQuery<{
      id: number;
      created_by: number;
      resource_type: string;
      resource_id: string;
      share_type: string;
      share_with_id: number;
    }>(
      'SELECT id, created_by, resource_type, resource_id, share_type, share_with_id FROM resource_shares WHERE id = $1',
      [shareId]
    );

    if (existingShare.length === 0) {
      return c.json({ error: 'Share not found' }, 404);
    }

    // For now, only allow the creator to delete shares
    // In a real application, you'd implement more sophisticated permission checking
    if (existingShare[0].created_by !== user.id) {
      return c.json({ error: 'You do not have permission to revoke this share' }, 403);
    }

    // Delete the share
    await runPostgresQuery('DELETE FROM resource_shares WHERE id = $1', [shareId]);

    // Log the revoke action
    await runPostgresQuery('INSERT INTO audit_logs(actor, event, details) VALUES($1, $2, $3)', [
      user.email,
      'resource_share_revoked',
      {
        shareId,
        resourceType: existingShare[0].resource_type,
        resourceId: existingShare[0].resource_id,
        shareType: existingShare[0].share_type,
        shareWithId: existingShare[0].share_with_id,
      },
    ]);

    return c.json({
      success: true,
      message: 'Share revoked successfully',
    });
  } catch (error) {
    console.error('Revoke share error:', error);
    return c.json({ error: 'Failed to revoke share' }, 500);
  }
});

// POST /sharing/invite - Send invitation
sharing.post('/invite', requireAuth, zValidator('json', inviteUserSchema), async (c) => {
  try {
    const user = getUser(c);
    const { email, role, orgId, departmentId, resourceType, resourceId, message } = c.req.valid('json');

    // Check if user already exists
    const existingUser = await runPostgresQuery<{ id: number; email: string }>(
      'SELECT id, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.length > 0) {
      return c.json({ error: 'User already exists in the system' }, 400);
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await runPostgresQuery<{ id: number }>(
      'SELECT id FROM share_invitations WHERE email = $1 AND accepted_at IS NULL AND expires_at > NOW()',
      [email.toLowerCase()]
    );

    if (existingInvitation.length > 0) {
      return c.json({ error: 'Pending invitation already exists for this email' }, 400);
    }

    // Generate invitation token
    const token = randomBytes(32).toString('hex');

    // Create the invitation
    const invitation = await runPostgresQuery<{
      id: number;
      email: string;
      role: string;
      token: string;
      expires_at: string;
      created_at: string;
    }>(
      `INSERT INTO share_invitations (email, role, org_id, department_id, token, created_by, invited_for_resource_type, invited_for_resource_id, invitation_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, email, role, token, expires_at, created_at`,
      [email.toLowerCase(), role, orgId || null, departmentId || null, token, user.id, resourceType || null, resourceId || null, message || null]
    );

    // In a real application, you would send an email here
    console.log(`Invitation sent to ${email} with token: ${token}`);

    // Log the invitation action
    await runPostgresQuery('INSERT INTO audit_logs(actor, event, details) VALUES($1, $2, $3)', [
      user.email,
      'invitation_sent',
      {
        invitationId: invitation[0].id,
        inviteeEmail: email,
        role,
        orgId,
        departmentId,
        resourceType,
        resourceId,
      },
    ]);

    return c.json({
      success: true,
      invitation: {
        ...invitation[0],
        // In development, include the token for testing
        ...(process.env.NODE_ENV === 'development' && { token }),
      },
      message: 'Invitation sent successfully',
    });
  } catch (error) {
    console.error('Send invitation error:', error);
    return c.json({ error: 'Failed to send invitation' }, 500);
  }
});

// POST /sharing/accept-invite - Accept invitation
sharing.post('/accept-invite', zValidator('json', acceptInviteSchema), async (c) => {
  try {
    const { token } = c.req.valid('json');

    // Find and validate the invitation
    const invitation = await runPostgresQuery<{
      id: number;
      email: string;
      role: string;
      org_id: number | null;
      department_id: number | null;
      expires_at: string;
      accepted_at: string | null;
    }>(
      'SELECT id, email, role, org_id, department_id, expires_at, accepted_at FROM share_invitations WHERE token = $1',
      [token]
    );

    if (invitation.length === 0) {
      return c.json({ error: 'Invalid invitation token' }, 400);
    }

    const invite = invitation[0];

    // Check if invitation has already been accepted
    if (invite.accepted_at) {
      return c.json({ error: 'Invitation has already been accepted' }, 400);
    }

    // Check if invitation has expired
    if (new Date(invite.expires_at) < new Date()) {
      return c.json({ error: 'Invitation has expired' }, 400);
    }

    // Check if user already exists (they might have signed up after invitation was sent)
    const existingUser = await runPostgresQuery<{ id: number }>(
      'SELECT id FROM users WHERE email = $1',
      [invite.email]
    );

    if (existingUser.length === 0) {
      return c.json({ 
        error: 'Please sign up first before accepting the invitation',
        redirectToSignup: true,
        email: invite.email
      }, 400);
    }

    const userId = existingUser[0].id;

    // Mark invitation as accepted
    await runPostgresQuery(
      'UPDATE share_invitations SET accepted_at = NOW() WHERE id = $1',
      [invite.id]
    );

    // Create membership if org/department specified
    if (invite.org_id || invite.department_id) {
      await runPostgresQuery(
        'INSERT INTO memberships (user_id, org_id, department_id, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [userId, invite.org_id, invite.department_id, invite.role]
      );
    }

    // Log the acceptance
    await runPostgresQuery('INSERT INTO audit_logs(actor, event, details) VALUES($1, $2, $3)', [
      invite.email,
      'invitation_accepted',
      {
        invitationId: invite.id,
        userId,
        orgId: invite.org_id,
        departmentId: invite.department_id,
        role: invite.role,
      },
    ]);

    return c.json({
      success: true,
      message: 'Invitation accepted successfully',
      membership: {
        userId,
        orgId: invite.org_id,
        departmentId: invite.department_id,
        role: invite.role,
      },
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    return c.json({ error: 'Failed to accept invitation' }, 500);
  }
});

export default sharing;