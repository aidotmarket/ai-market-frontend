import type { ListingDetail } from '@/types';

type SampleFile<Binding extends string> = {
  index: number;
  key_basename: string;
  size: number;
  binding: Binding;
  state: 'available' | 'unavailable';
  url: string;
};

// Gate 2 §4.2a/§4.5: page-local extensions of the public API carriers.
export type ListingWithSamples = ListingDetail & {
  sample_files?: SampleFile<'manifest'>[] | null;
  approved_presentation?: NonNullable<ListingDetail['approved_presentation']> & {
    sample_files?: SampleFile<'etag_md5' | 'size_only'>[] | null;
  };
  verification_scope?: string | null;
};

const bindingLabels = {
  manifest: 'verified: part of the published dataset',
  etag_md5: 'checksum-matched copy',
  size_only: 'copy provided by the seller',
};

export default function SampleFiles({ files }: {
  files: SampleFile<keyof typeof bindingLabels>[] | null | undefined;
}) {
  if (!files?.length) return null;

  return (
    <section aria-labelledby="free-sample-heading" className="rounded-xl border border-gray-200 p-6">
      <h2 id="free-sample-heading" className="text-lg font-semibold">Free sample: {files.length} files</h2>
      <p className="mt-2 text-sm text-gray-600">Sample files are part of the purchased set and free to download.</p>
      <ul className="mt-4 space-y-3">
        {files.map((file) => (
          <li key={file.index} className="text-sm">
            {file.state === 'available' ? (
              <a href={file.url} download className="break-all text-indigo-700 underline">{file.key_basename}</a>
            ) : (
              <><span className="break-all">{file.key_basename}</span> <span className="text-gray-600">(sample unavailable)</span></>
            )}
            <span className="ml-2 text-gray-600">{formatSampleSize(file.size)}</span>
            <p className="mt-1 text-gray-600">{bindingLabels[file.binding]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatSampleSize(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const unit = bytes > 0 ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return `${Number((bytes / 1024 ** unit).toFixed(1))} ${units[unit]}`;
}
