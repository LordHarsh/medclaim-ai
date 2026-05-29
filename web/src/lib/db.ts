import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

export async function query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
  const result = await pool.query(text, params ?? []);
  return result.rows as Record<string, unknown>[];
}

/**
 * Execute queries with RLS context set for the current user.
 * Sets app.current_user_id so RLS policies can filter by ownership.
 */
export async function queryAsUser(
  userId: string,
  text: string,
  params?: unknown[]
): Promise<Record<string, unknown>[]> {
  const client = await pool.connect();
  try {
    await client.query("SET LOCAL app.current_user_id = $1", [userId]);
    const result = await client.query(text, params ?? []);
    return result.rows as Record<string, unknown>[];
  } finally {
    client.release();
  }
}

/**
 * Execute queries with RLS bypass (for service-level operations like SQS enqueue).
 */
export async function queryAsService(
  text: string,
  params?: unknown[]
): Promise<Record<string, unknown>[]> {
  const client = await pool.connect();
  try {
    await client.query("SET LOCAL app.bypass_rls = 'on'");
    const result = await client.query(text, params ?? []);
    return result.rows as Record<string, unknown>[];
  } finally {
    client.release();
  }
}

export default query;
