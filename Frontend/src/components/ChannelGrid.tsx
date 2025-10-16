import ChannelCard from "./ChannelCard";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  channels: any[];
  loading: boolean;
  onPlay: (c: any) => void;
  activeUrl?: string | null;
};

export default function ChannelGrid({ channels, loading, onPlay, activeUrl }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="ui-card h-36 skeleton" />
        ))}
      </div>
    );
  }

  if (!channels || channels.length === 0) {
    return <div className="text-center py-10" style={{ color: "var(--muted)" }}>No channels found</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <AnimatePresence initial={false}>
        {channels.map((c, idx) => (
          <motion.div
            key={c.url || c.id || c.name}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut", delay: Math.min(idx * 0.02, 0.2) }}
          >
            <ChannelCard
              channel={c}
              onPlay={onPlay}
              active={!!activeUrl && c.url === activeUrl}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
