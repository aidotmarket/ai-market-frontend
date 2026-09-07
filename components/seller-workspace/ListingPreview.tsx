import type { ListingDraftContent } from '@/api/sellerListingDraft';

type PublicFields = Pick<ListingDraftContent, 'title' | 'description' | 'category' | 'tags' | 'price' | 'license'>;

export default function ListingPreview({ draft }: { draft: PublicFields }) {
  const tags = [...new Set(draft.tags.split(',').map(tag => tag.trim()).filter(Boolean))];
  const price = /^\d+(\.\d{1,2})?$/.test(draft.price) && Number.isFinite(Number(draft.price))
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(draft.price)) : null;
  return <section aria-label="Listing preview" className="space-y-5 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 sm:p-6">
    <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Private preview</p><h3 className="mt-2 text-lg font-semibold text-gray-900">Review your listing</h3><p className="mt-2 text-sm leading-6 text-gray-600">Check the wording buyers would see. This preview uses your current fields, including any unsaved edits.</p></div>
    <article className="space-y-5 rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-indigo-700">{draft.category.trim() || 'Add a category'}</p>
      <h4 className="break-words text-2xl font-semibold text-gray-900">{draft.title.trim() || 'Add a listing title'}</h4>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-gray-700">{draft.description.trim() || 'Add a description for buyers.'}</p>
      {tags.length > 0 ? <ul aria-label="Listing tags" className="flex flex-wrap gap-2">{tags.map(tag => <li key={tag} className="max-w-full break-words rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">{tag}</li>)}</ul> : <p className="text-sm text-gray-500">Add tags to help buyers find your offering.</p>}
      <dl className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2"><div><dt className="text-xs text-gray-500">Price</dt><dd className="mt-1 text-lg font-semibold text-gray-900">{price ?? 'Set a valid price'}</dd></div><div><dt className="text-xs text-gray-500">License</dt><dd className="mt-1 break-words text-sm text-gray-900">{draft.license.trim() || 'Choose your license'}</dd></div></dl>
    </article>
    <p className="text-sm leading-6 text-gray-600">Your brief, conversation and unaccepted suggestions are private and do not appear here. Publishing will become available after source selection and final approval are connected.</p>
  </section>;
}
