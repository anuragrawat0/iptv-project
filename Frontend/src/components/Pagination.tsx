
type Props = {
  page: number;
  setPage: (p: number) => void;
  limit?: number;
  total?: number;
  hasMore?: boolean; // fallback mode when total not provided
};

export default function Pagination({ page, setPage, limit, total, hasMore }: Props) {
  const totalPages = total && limit ? Math.max(1, Math.ceil(total / limit)) : undefined;
  const canPrev = page > 1;
  const canNext = totalPages ? page < totalPages : hasMore !== false;

  return (
    <div className="flex items-center gap-3 mt-6 select-none">
      <button
        onClick={() => setPage(Math.max(1, page - 1))}
        className={`ui-pill ${!canPrev ? "opacity-50 cursor-not-allowed" : ""}`}
        disabled={!canPrev}
      >
        Previous
      </button>

      <div className="text-sm" style={{ color: "var(--muted)" }}>
        {totalPages ? `Page ${page} of ${totalPages}` : `Page ${page}`}
      </div>

      <button
        onClick={() => setPage(page + 1)}
        className={`ui-pill ${!canNext ? "opacity-50 cursor-not-allowed" : ""}`}
        disabled={!canNext}
      >
        Next
      </button>
    </div>
  );
}
