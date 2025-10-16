import React, { useEffect, useMemo, useState } from "react";
import FilterBar from "@/components/FilterBar";
import ChannelGrid from "@/components/ChannelGrid";
import Pagination from "@/components/Pagination";
import SidePlayer from "@/components/SidePlayer";
import { useChannels } from "@/hooks/useChannels";
import useDebounce from "@/hooks/useDebounce";
import { fetchChannelsCount } from "@/lib/api";
import { motion } from "framer-motion";

export default function HomePage() {
  const [filters, setFilters] = useState<any>({});
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(24);
  const [query, setQuery] = useState<string>("");
  const [validate] = useState<boolean>(true);
  const [workingOnly, setWorkingOnly] = useState<boolean>(false);

  const debQuery = useDebounce(query, 400);

  // Build q param: language code if present, otherwise country/subdivision/city or plain query text.
  const q = useMemo(() => {
    if (filters.reset) {
      return debQuery || undefined;
    }
    if (filters.languageCode) return filters.languageCode;
    if (filters.cityCode) return filters.cityCode;
    if (filters.subdivisionCode) return filters.subdivisionCode;
    if (filters.countryCode) return filters.countryCode;
    return debQuery || undefined;
  }, [filters, debQuery]);

  // Fetch total count for accurate pagination when not restricting to "working only"
  const [total, setTotal] = useState<number | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    if (!workingOnly) {
      fetchChannelsCount({ q })
        .then((n) => alive && setTotal(n))
        .catch(() => alive && setTotal(undefined));
    } else {
      setTotal(undefined);
    }
    return () => {
      alive = false;
    };
  }, [q, workingOnly]);

  const { channels, loading } = useChannels({ q, page, limit, validate, working_only: workingOnly });

  const [playing, setPlaying] = useState<any | null>(null);

  return (
    <>
      <FilterBar
        onFiltersChange={(s) => {
          setFilters(s);
          setPage(1);
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <motion.div
            className="mb-4 flex items-center gap-3"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <input
              placeholder="Search channels, groups..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="ui-input w-full md:w-1/2"
            />
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={workingOnly}
                onChange={(e) => {
                  setWorkingOnly(e.target.checked);
                  setPage(1);
                }}
              />
              Only working
            </label>
            <button
              onClick={() => {
                setFilters({});
                setQuery("");
                setPage(1);
                setWorkingOnly(false);
              }}
              className="ui-btn ui-btn-primary"
            >
              Reset
            </button>
          </motion.div>

          <ChannelGrid channels={channels} loading={loading} onPlay={(ch) => setPlaying(ch)} activeUrl={playing?.url} />

          <Pagination
            page={page}
            setPage={setPage}
            limit={limit}
            total={!workingOnly ? total : undefined}
            hasMore={workingOnly ? channels?.length === limit : undefined}
          />
        </div>

        <div className="lg:col-span-1">
          <SidePlayer src={playing?.url} title={playing?.name} />
        </div>
      </div>
    </>
  );
}
