import React, { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";

interface Channel {
  name: string;
  logo: string | null;
  url: string;
  tvg_language?: string | null;
  tvg_country?: string | null;
  group_title?: string | null;
}

type FetchResult = { count: number; channels: Channel[] };

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const DEBOUNCE_MS = 300;

const App: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>("");
  const [country, setCountry] = useState<string>("");
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const bothFiltersSet = useMemo(() => {
    return language.trim() !== "" && country.trim() !== "";
  }, [language, country]);

  const endpoint = useMemo(() => {
    if (bothFiltersSet) return null;
    if (language.trim()) {
      return `/languages/${encodeURIComponent(language.trim())}`;
    }
    if (country.trim()) {
      return `/countries/${encodeURIComponent(country.trim())}`;
    }
    return `/channels`;
  }, [language, country, bothFiltersSet]);

  const fetchChannels = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    if (bothFiltersSet) {
      setLoading(false);
      setChannels([]);
      setError("Please select either Language OR Country, not both.");
      return;
    }

    try {
      const url = `${API_BASE}${endpoint ?? "/channels"}`;
      const res = await fetch(url, { signal, cache: "no-cache" });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${text ? ` — ${text}` : ""}`);
      }

      const data: FetchResult = await res.json();
      setChannels(data.channels || []);

      if (currentUrl && !data.channels.find((c) => c.url === currentUrl)) {
        setCurrentUrl(null);
        if (videoRef.current) {
          try {
            videoRef.current.pause();
            videoRef.current.removeAttribute("src");
            videoRef.current.load();
          } catch {}
        }
      }
      setError(null);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setError(e?.message || "Failed to load channels");
        setChannels([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    fetchChannels(ac.signal);
    return () => ac.abort();
  }, []);

  useEffect(() => {
    window.clearTimeout(debounceRef.current ?? 0);
    abortRef.current?.abort();

    debounceRef.current = window.setTimeout(() => {
      const ac = new AbortController();
      abortRef.current = ac;
      fetchChannels(ac.signal);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(debounceRef.current ?? 0);
    };
  }, [endpoint]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    if (!currentUrl) {
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {}
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data?.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              try {
                hls.startLoad();
              } catch {}
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              try {
                hls.recoverMediaError();
              } catch {}
              break;
            default:
              try {
                hls.destroy();
                hlsRef.current = null;
              } catch {}
              break;
          }
        }
      });

      hls.loadSource(currentUrl);
      try {
        hls.attachMedia(video);
      } catch {
        try {
          video.src = currentUrl;
        } catch {}
      }
      video.play().catch(() => {});
      return () => {
        try {
          hls.destroy();
        } catch {}
        hlsRef.current = null;
      };
    }

    try {
      video.src = currentUrl;
      video.play().catch(() => {});
    } catch {}
  }, [currentUrl]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute("src");
          videoRef.current.load();
        } catch {}
      }
    };
  }, []);

  const quickFilterLanguage = (l: string) => {
    setCountry("");
    setLanguage(l);
  };

  const quickFilterCountry = (c: string) => {
    setLanguage("");
    setCountry(c.toUpperCase());
  };

  const clearFilters = () => {
    setLanguage("");
    setCountry("");
  };

  return (
    <div style={{ padding: 16, fontFamily: "Inter, system-ui, sans-serif", background: "lightgray", color: "#111827" }}>
      <h1 style={{ margin: 0, fontSize: 22, textAlign: "center" }}>LULU TV📺</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Language (English or eng)</label>
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ padding: 8, minWidth: 200, borderRadius: 6, border: "1px solid #d1d5db" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Country (JP or Japan)</label>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            style={{
              padding: 8,
              minWidth: 160,
              textTransform: "uppercase",
              borderRadius: 6,
              border: "1px solid #d1d5db",
            }}
            maxLength={2}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              abortRef.current?.abort();
              const ac = new AbortController();
              abortRef.current = ac;
              fetchChannels(ac.signal);
            }}
            style={{ padding: "8px 12px", borderRadius: 6, background: "#2563eb", color: "#fff", border: "none", marginTop: "16px" }}
          >
            Refresh
          </button>

          <button
            onClick={clearFilters}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              background: "#f3f4f4",
              border: "1px solid #e5e7eb",
              marginTop: "16px",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => quickFilterLanguage("Hindi")} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb" }}>
          Hindi
        </button>
        <button onClick={() => quickFilterCountry("IN")} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb" }}>
          India
        </button>
        <button onClick={() => quickFilterLanguage("English")} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb" }}>
          English
        </button>
        <button onClick={() => quickFilterCountry("US")} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #e5e7eb" }}>
          USA
        </button>
      </div>

      <div style={{ marginTop: 6 }}>
        <video ref={videoRef} controls autoPlay style={{ width: "100%", maxWidth: 960, background: "#000", borderRadius: 8 }} playsInline />
      </div>

      <div style={{ marginTop: 12, fontSize: 14 }}>
        {bothFiltersSet && <span style={{ color: "crimson" }}>Please choose either Language OR Country, not both.</span>}
        {loading && <span>Loading channels…</span>}
        {error && !bothFiltersSet && <span style={{ color: "crimson" }}>Error: {error}</span>}
        {!loading && !error && !bothFiltersSet && (
          <span>
            Showing <b>{channels.length}</b> channel(s)
            {language ? ` | Language: ${language}` : ""}
            {country ? ` | Country: ${country}` : ""}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", marginTop: 20, gap: 12 }}>
        {!loading && !error && channels.length === 0 && !bothFiltersSet && (
          <div style={{ fontSize: 16 }}>
            <b>No channels available for the selected filters.</b>
          </div>
        )}

        {channels.map((ch, idx) => {
          const isActive = currentUrl === ch.url;
          const primaryLang = (ch.tvg_language || "").split(/[;,/]/)[0] || "—";
          const primaryCountry = (ch.tvg_country || "").split(/[;,/]/)[0] || "—";

          return (
            <div
              key={`${ch.url}-${idx}`}
              onClick={() => setCurrentUrl(ch.url)}
              title={`${ch.name} (${primaryLang} / ${primaryCountry})`}
              style={{
                margin: 4,
                cursor: "pointer",
                textAlign: "center",
                width: 140,
                padding: 10,
                border: isActive ? "2px solid #3b82f6" : "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                background: "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                userSelect: "none",
              }}
            >
              {ch.logo ? (
                <img
                  src={ch.logo}
                  alt={ch.name}
                  style={{
                    width: 110,
                    height: 90,
                    objectFit: "contain",
                    background: "#f8fafc",
                    borderRadius: 6,
                    marginBottom: 8,
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 110,
                    height: 90,
                    background: "#f1f5f9",
                    borderRadius: 6,
                    marginBottom: 8,
                  }}
                />
              )}

              <div style={{ fontSize: 13, fontWeight: 600 }}>{ch.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {primaryLang} / {primaryCountry}
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "center" }}>
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setCurrentUrl(ch.url);
                  }}
                  style={{
                    padding: "6px 8px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid #e5e7eb",
                    background: isActive ? "#e0f2fe" : "#fff",
                  }}
                >
                  Play
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default App;
