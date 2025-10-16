import { useMemo, useState } from "react";

export default function ChannelCard({
  channel,
  onPlay,
  active = false,
}: {
  channel: any;
  onPlay: (ch: any) => void;
  active?: boolean;
}) {
  const [logoError, setLogoError] = useState(false);
  const logoSrc: string | null = useMemo(() => {
    const src = channel.tvg_logo || channel.logo || null;
    return src || null;
  }, [channel?.tvg_logo, channel?.logo]);

  const cardCls = [
    "ui-card group cursor-pointer overflow-hidden flex flex-col",
    active ? "border-[color:var(--primary)] shadow-[0_0_0_2px_var(--ring)]" : "",
  ].join(" ");

  return (
    <div
      className={cardCls}
      onClick={() => onPlay(channel)}
      title={channel?.name || ""}
      aria-pressed={active}
    >
      <div className="p-3 flex-1">
        <div className="flex items-start gap-3">
          <div className="w-16 h-12 rounded-md flex items-center justify-center overflow-hidden bg-[color:var(--surface-elev)]">
            {logoSrc && !logoError ? (
              <img
                src={logoSrc}
                alt={channel.name}
                className="max-h-12 max-w-full object-contain transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="text-xs font-medium truncate w-full text-center" style={{ color: "var(--muted)" }}>
                {channel.group ?? "TV"}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate" style={{ color: "var(--text)" }}>
              {channel.name}
            </div>
            <div className="text-xs mt-1 truncate" style={{ color: "var(--muted)" }}>
              {channel.language ?? "—"} • {channel.country ?? "—"}
            </div>
            {/* URL removed per requirements */}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-[color:var(--border)]">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            {channel.working ? (
              <span className="ui-badge">working</span>
            ) : (
              <span className="ui-badge-muted">unknown</span>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay(channel);
            }}
            className={["ui-btn text-sm", active ? "ui-btn-primary" : "ui-btn-ghost"].join(" ")}
          >
            Play
          </button>
        </div>
      </div>
    </div>
  );
}
