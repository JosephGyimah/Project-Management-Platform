import type { AuthUser, UserRole } from '@pmp/contracts';
import type { Pool } from 'pg';
import { hashPassword } from './auth.js';

type StoredUser = AuthUser & { passwordHash: string | null };

const toUser = (row: Record<string, unknown>): StoredUser => ({
  id: String(row.id),
  email: String(row.email),
  displayName: String(row.display_name),
  role: String(row.role) as UserRole,
  passwordHash: row.password_hash ? String(row.password_hash) : null
});

export class PgAuthStore {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const result = await this.pool.query(
      `select id, email, display_name, role, password_hash
       from users
       where lower(email) = lower($1)
       limit 1`,
      [email]
    );

    return result.rowCount ? toUser(result.rows[0]) : null;
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    const result = await this.pool.query(
      `select id, email, display_name, role
       from users
       where id = $1
       limit 1`,
      [userId]
    );

    if (!result.rowCount) return null;

    const row = result.rows[0];
    return {
      id: String(row.id),
      email: String(row.email),
      displayName: String(row.display_name),
      role: String(row.role) as UserRole
    };
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      `insert into user_sessions (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  }

  async rotateSession(currentTokenHash: string, nextTokenHash: string, expiresAt: Date): Promise<AuthUser | null> {
    const result = await this.pool.query(
      `update user_sessions s
       set token_hash = $2,
           expires_at = $3,
           revoked_at = null
       from users u
       where s.user_id = u.id
         and s.token_hash = $1
         and s.revoked_at is null
         and s.expires_at > now()
       returning u.id, u.email, u.display_name, u.role`,
      [currentTokenHash, nextTokenHash, expiresAt]
    );

    if (!result.rowCount) return null;

    const row = result.rows[0];
    return {
      id: String(row.id),
      email: String(row.email),
      displayName: String(row.display_name),
      role: String(row.role) as UserRole
    };
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query(
      `update user_sessions
       set revoked_at = now()
       where token_hash = $1`,
      [tokenHash]
    );
  }

  async seedDefaultUsers(): Promise<void> {
    const defaults: Array<{ email: string; displayName: string; role: UserRole; password: string }> = [
      { email: 'admin@pmp.local', displayName: 'Admin User', role: 'admin', password: 'AdminPass123!' },
      { email: 'lead@pmp.local', displayName: 'Project Lead User', role: 'project_lead', password: 'LeadPass123!' },
      { email: 'member@pmp.local', displayName: 'Member User', role: 'member', password: 'MemberPass123!' }
    ];

    for (const user of defaults) {
      const passwordHash = await hashPassword(user.password);
      await this.pool.query(
        `insert into users (email, display_name, role, password_hash)
         values ($1, $2, $3, $4)
         on conflict (email)
         do update set display_name = excluded.display_name, role = excluded.role, password_hash = excluded.password_hash`,
        [user.email, user.displayName, user.role, passwordHash]
      );
    }
  }
}
