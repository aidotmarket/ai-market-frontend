type Props = {
  page: number;
  hasNext: boolean;
  loading: boolean;
  onPageChange: (page: number) => void;
};

export default function InquiryListPager({ page, hasNext, loading, onPageChange }: Props) {
  return (
    <nav aria-label="Inquiry pages" className="mt-6 flex items-center gap-4">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}
        className="rounded border px-3 py-2 disabled:opacity-50">Previous</button>
      <span aria-live="polite">Page {page}</span>
      <button type="button" disabled={loading || !hasNext} onClick={() => onPageChange(page + 1)}
        className="rounded border px-3 py-2 disabled:opacity-50">Next</button>
    </nav>
  );
}
