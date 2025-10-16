import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import useFetch from "@/hooks/useFetch";
import { fetchLanguages, fetchCountries } from "@/lib/api";

type Props = {
  onFiltersChange: (state: {
    languageCode?: string | null;
    countryCode?: string | null;
    subdivisionCode?: string | null;
    reset?: boolean;
  }) => void;
};

// Reusable searchable combobox component
function SearchableSelect<T extends { code?: string; name?: string }>(props: {
  label: string;
  items: T[];
  value: string | null;
  onChange: (val: string | null) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  extractLabel?: (item: T) => string;
  extractValue?: (item: T) => string;
}) {
  const {
    label,
    items,
    value,
    onChange,
    placeholder = "Search or select...",
    loading = false,
    disabled = false,
    extractLabel = (i: any) => i.name ?? i.code ?? "",
    extractValue = (i: any) => i.code ?? "",
  } = props;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Derive displayed label when a value is selected and query is empty
  const selectedItem = useMemo(() => items.find((it) => extractValue(it) === value), [items, value, extractValue]);
  const displayedInput = query !== "" ? query : selectedItem ? extractLabel(selectedItem) : "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const lab = (extractLabel(it) || "").toLowerCase();
      const val = (extractValue(it) || "").toLowerCase();
      return lab.includes(q) || val.includes(q);
    });
  }, [items, query, extractLabel, extractValue]);

  useEffect(() => {
    // reset highlight when filtered changes
    setHighlight(filtered.length > 0 ? 0 : -1);
  }, [filtered.length]);

  useEffect(() => {
    // If the selected value was externally changed, clear query so the selected label shows
    if (!value) setQuery("");
  }, [value]);

  // keyboard handlers
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, Math.max(0, h + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, Math.max(0, h - 1)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlight]) {
        const sel = filtered[highlight];
        onChange(extractValue(sel) || null);
        setQuery("");
        setOpen(false);
      } else if (!open && filtered.length === 1) {
        onChange(extractValue(filtered[0]) || null);
        setQuery("");
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (
        !inputRef.current ||
        inputRef.current.contains(e.target as Node) ||
        (listRef.current && listRef.current.contains(e.target as Node))
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="min-w-[220px] relative">
      <label className="text-sm block mb-1" style={{ color: "var(--muted)" }}>{label}</label>

      <div className="relative">
        <div
          className={[
            "w-full flex items-center gap-2 rounded-md border px-2 py-1",
            value ? "border-[color:var(--primary)]" : "border-[color:var(--border)]",
            disabled ? "opacity-60 pointer-events-none bg-[color:var(--surface-elev)]" : "bg-[color:var(--surface)]",
          ].join(" ")}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-owns={`${label}-listbox`}
        >
          <input
            ref={inputRef}
            className="flex-1 outline-none px-1 py-1 bg-transparent"
            placeholder={selectedItem ? "" : placeholder}
            value={displayedInput}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            disabled={loading || disabled}
            aria-controls={`${label}-listbox`}
            aria-autocomplete="list"
            aria-activedescendant={
              open && highlight >= 0 && filtered[highlight]
                ? `${label}-opt-${extractValue(filtered[highlight])}`
                : undefined
            }
          />

          {/* clear search */}
          {query ? (
            <button
              type="button"
              className="ui-btn ui-btn-ghost text-xs px-2 py-1"
              onClick={() => setQuery("")}
              title="Clear search"
            >
              ✕
            </button>
          ) : null}

          {/* clear selection */}
          {value ? (
            <button
              type="button"
              className="ui-btn ui-btn-ghost text-xs px-2 py-1"
              onClick={() => {
                onChange(null);
                setQuery("");
              }}
              title="Clear selection"
            >
              Clear
            </button>
          ) : null}
        </div>

        {/* dropdown */}
        <AnimatePresence>
          {open && filtered.length > 0 && !disabled && (
            <motion.ul
              id={`${label}-listbox`}
              role="listbox"
              ref={listRef}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute z-40 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-[color:var(--surface)] shadow-lg border-[color:var(--border)]"
            >
              {filtered.map((it, idx) => {
                const val = extractValue(it);
                const lab = extractLabel(it);
                const isHighlighted = idx === highlight;
                return (
                  <li
                    id={`${label}-opt-${val}`}
                    key={val + "-" + idx}
                    role="option"
                    aria-selected={value === val}
                    tabIndex={-1}
                    onMouseDown={(ev) => {
                      // prevent blur
                      ev.preventDefault();
                      onChange(val || null);
                      setQuery("");
                      setOpen(false);
                    }}
                    onMouseEnter={() => setHighlight(idx)}
                    className={[
                      "cursor-pointer px-3 py-2",
                      isHighlighted ? "bg-[color:var(--surface-elev)]" : "",
                      value === val ? "font-semibold" : "",
                    ].join(" ")}
                  >
                    <div className="flex justify-between items-center">
                      <span className="block">{lab}</span>
                      <small className="text-xs ml-2" style={{ color: "var(--muted)" }}>
                        {val}
                      </small>
                    </div>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function FilterBar({ onFiltersChange }: Props) {
  const { data: langs, loading: langsLoading } = useFetch(() => fetchLanguages(), []);
  const { data: countries, loading: countriesLoading } = useFetch(() => fetchCountries(), []);

  const [language, setLanguage] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [subdivision, setSubdivision] = useState<string | null>(null);

  // Prepare arrays
  const allLangs = useMemo(() => (langs ?? []) as any[], [langs]);
  const allCountries = useMemo(() => (countries ?? []) as any[], [countries]);

  const selectedCountry = useMemo(
    () => allCountries.find((c: any) => ((c.code || "") as string).toLowerCase() === (country || "").toLowerCase()),
    [allCountries, country]
  );

  const subdivisionsForCountry = useMemo(() => selectedCountry?.subdivisions ?? [], [selectedCountry]);
  const hasSubs = subdivisionsForCountry.length > 0;

  // When language chosen, clear country & subdivision
  useEffect(() => {
    if (language) {
      setCountry(null);
      setSubdivision(null);
    }
    onFiltersChange({ languageCode: language, countryCode: country, subdivisionCode: subdivision });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // When country chosen, clear language & subdivision
  useEffect(() => {
    if (country) {
      setLanguage(null);
      setSubdivision(null);
    }
    onFiltersChange({ languageCode: language, countryCode: country, subdivisionCode: subdivision });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // subdivision effect
  useEffect(() => {
    onFiltersChange({ languageCode: language, countryCode: country, subdivisionCode: subdivision });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdivision]);

  // Convenience: transform countries into {code,name,subdivisions}
  const countryItems = useMemo(
    () => allCountries.map((c: any) => ({ code: c.code, name: c.name, subdivisions: c.subdivisions ?? [] })),
    [allCountries]
  );

  return (
    <div className="ui-surface p-4 mb-6 sticky top-16 z-30 backdrop-blur">
      <div className="flex gap-3 flex-wrap items-center">
        <SearchableSelect
          label="Languages"
          items={allLangs}
          value={language}
          onChange={(val) => setLanguage(val)}
          placeholder="Search language..."
          loading={langsLoading}
          extractLabel={(l: any) => `${l.name}${l.channels != null ? ` (${l.channels})` : ""}`}
          extractValue={(l: any) => l.code}
        />

        <SearchableSelect
          label="Countries"
          items={countryItems}
          value={country}
          onChange={(val) => setCountry(val)}
          placeholder="Search country..."
          loading={countriesLoading}
          extractLabel={(c: any) => c.name}
          extractValue={(c: any) => c.code}
        />

        <SearchableSelect
          label="Subdivisions"
          items={subdivisionsForCountry}
          value={subdivision}
          onChange={(val) => setSubdivision(val)}
          placeholder={hasSubs ? "Search subdivision..." : "No subdivisions"}
          loading={false}
          disabled={!hasSubs}
          extractLabel={(s: any) => s.name}
          extractValue={(s: any) => s.code}
        />

        <div className="flex items-end gap-2 ml-auto">
          <button
            onClick={() => {
              setLanguage(null);
              setCountry(null);
              setSubdivision(null);
              onFiltersChange({ reset: true });
            }}
            className="ui-btn ui-btn-primary px-4 py-2"
          >
            All Channels
          </button>
        </div>
      </div>
    </div>
  );
}
