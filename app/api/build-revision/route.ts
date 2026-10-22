export const dynamic = 'force-dynamic';

export function GET() {
  // Direct access is required for Next's build-time constant substitution.
  const revision = process.env.FRONTEND_BUILD_REVISION;
  return Response.json(
    { revision: revision?.length === 40 && /^[0-9a-f]{40}$/.test(revision) ? revision : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
