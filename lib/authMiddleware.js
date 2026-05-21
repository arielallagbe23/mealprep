import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Verifies mpc_token cookie and returns the decoded payload, or null if unauthorized.
 * @returns {Promise<{uid: string, email: string, nickname: string|null}|null>}
 */
export async function requireAuth() {
  if (!JWT_SECRET) return null;
  const cookieStore = await cookies();
  const token = cookieStore.get("mpc_token")?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
