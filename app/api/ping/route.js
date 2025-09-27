export const runtime = "nodejs";

export async function GET() {
  return new Response("pong", { status: 200 });
}
