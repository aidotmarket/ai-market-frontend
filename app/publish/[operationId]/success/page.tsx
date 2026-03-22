import Link from 'next/link';

export default async function PublishSuccessPage({
  params,
}: {
  params: Promise<{ operationId: string }>;
}) {
  const { operationId } = await params;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f6d88c_0%,#fff9ef_35%,#f4efe5_100%)] px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-[2.5rem] border border-stone-200 bg-white/90 p-10 text-center shadow-[0_36px_120px_-72px_rgba(30,24,18,0.7)]">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-700">
          *
        </div>
        <p className="mt-6 text-sm uppercase tracking-[0.35em] text-stone-500">Publish complete</p>
        <h1 className="mt-3 text-4xl font-semibold text-stone-950">Listing flow finalized</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-stone-600">
          The publish operation has reached its final state. Share the listing internally, send the direct wizard resume URL to collaborators, or return to the seller dashboard for the next launch.
        </p>

        <div className="mt-10 grid gap-4 rounded-[2rem] bg-stone-950 p-6 text-left text-stone-50 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Listing preview</p>
            <p className="mt-3 text-lg font-semibold">Operation {operationId}</p>
            <p className="mt-2 text-sm text-stone-300">The final metadata, privacy review, and pricing approvals were captured in the publish wizard state.</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Share links</p>
            <div className="mt-3 flex flex-col gap-3">
              <Link href={`/publish/${operationId}`} className="rounded-full bg-white/10 px-4 py-3 text-sm font-semibold text-white">
                Reopen wizard
              </Link>
              <Link href="/dashboard/listings" className="rounded-full bg-amber-300 px-4 py-3 text-sm font-semibold text-stone-950">
                Open dashboard listings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
