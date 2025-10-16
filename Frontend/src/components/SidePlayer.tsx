import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { motion } from "framer-motion";

type Props = {
  src?: string | null;
  title?: string | null;
};

export default function SidePlayer({ src, title }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Baseline settings to allow autoplay in inline contexts
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    // @ts-ignore - playsInline is a valid property on HTMLVideoElement in browsers
    video.playsInline = true;
    video.autoplay = true;
  }, []);

  // Update source while keeping the same HLS instance alive, plus detailed diagnostics
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Attach useful video event diagnostics
    const onVideoError = () => {
      const mediaError = video.error;
      // eslint-disable-next-line no-console
      console.warn("[SidePlayer] <video> error", {
        code: mediaError?.code,
        message: (mediaError as any)?.message,
        src,
      });
    };
    const onStalled = () => console.warn("[SidePlayer] <video> stalled", { src });
    const onWaiting = () => console.warn("[SidePlayer] <video> waiting", { src });

    video.addEventListener("error", onVideoError);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("waiting", onWaiting);

    if (!src) {
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
          hlsRef.current.detachMedia();
        } catch {}
      }
      try {
        video.pause();
      } catch {}
      video.removeAttribute("src");
      try {
        video.load();
      } catch {}
      return () => {
        video.removeEventListener("error", onVideoError);
        video.removeEventListener("stalled", onStalled);
        video.removeEventListener("waiting", onWaiting);
      };
    }

    // eslint-disable-next-line no-console
    console.debug("[SidePlayer] setting src", src);

    // Safari (native HLS)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      void video.play().catch(() => {});
      return () => {
        video.removeEventListener("error", onVideoError);
        video.removeEventListener("stalled", onStalled);
        video.removeEventListener("waiting", onWaiting);
      };
    }

    // Non-HLS fallback (some URLs are direct MP4/TS)
    if (!Hls.isSupported()) {
      video.src = src;
      void video.play().catch(() => {});
      return () => {
        video.removeEventListener("error", onVideoError);
        video.removeEventListener("stalled", onStalled);
        video.removeEventListener("waiting", onWaiting);
      };
    }

    let hls = hlsRef.current;
    if (!hls) {
      // Create once and keep across src changes to avoid re-allocations
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });
      hlsRef.current = hls;
      hls.attachMedia(video);

      // Robust error recovery to handle CORS/network/media errors
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        // eslint-disable-next-line no-console
        console.warn("[SidePlayer] HLS error", data);
        if (data?.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              try {
                hls!.startLoad();
              } catch {}
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              try {
                hls!.recoverMediaError();
              } catch {}
              break;
            default:
              try {
                hls!.destroy();
              } catch {}
              hlsRef.current = null;
          }
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => {});
      });
    }

    // Switch source (keep instance)
    try {
      hls.stopLoad();
    } catch {}
    hls.loadSource(src);

    return () => {
      video.removeEventListener("error", onVideoError);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("waiting", onWaiting);
    };
  }, [src]);

  // Destroy only when the component unmounts
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
    };
  }, []);

  return (
    <motion.div
      className="ui-surface p-3 sticky top-28"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="text-sm font-medium mb-2 truncate" style={{ color: "var(--muted)" }}>
        {title || "Player"}
      </div>
      <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden flex items-center justify-center">
        <video
          ref={videoRef}
          controls
          muted
          playsInline
          autoPlay
          crossOrigin="anonymous"
          className="w-full h-full video-black-border"
        />
        {!src && (
          <div className="absolute text-xs" style={{ color: "var(--muted)" }}>
            Select a channel to start playback
          </div>
        )}
      </div>
    </motion.div>
  );
}