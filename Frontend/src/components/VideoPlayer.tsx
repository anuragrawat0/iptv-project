import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { motion } from "framer-motion";

export default function VideoPlayer({ src, title, onClose }: { src?: string | null; title?: string; onClose?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // cleanup any existing hls instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!src) return;

    const isNative = video.canPlayType("application/vnd.apple.mpegurl");
    if (isNative) {
      video.src = src;
      video.play().catch(() => {});
    } else if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else {
      // not supported
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  if (!src) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        className="relative max-w-4xl w-full ui-surface rounded-lg overflow-hidden shadow-lg"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="p-2 flex items-center justify-between">
          <div className="font-medium" style={{ color: "var(--text)" }}>{title}</div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost px-3 py-1">Close</button>
        </div>
        <video
          ref={videoRef}
          controls
          className="w-full video-black-border"
          style={{ height: "60vh", background: "#000" }}
        />
      </motion.div>
    </motion.div>
  );
}
