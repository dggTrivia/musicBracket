import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Play, RotateCcw } from "lucide-react";
import type { Song, SourceOverride } from "./types";
type PlayerAPI = {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (n: number) => void;
  seekTo: (n: number, allow: boolean) => void;
  getCurrentTime: () => number;
  destroy: () => void;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, config: unknown) => PlayerAPI };
    onYouTubeIframeAPIReady?: () => void;
  }
}
let api: Promise<void> | undefined;
function loadApi() {
  if (!api)
    api = new Promise((resolve, reject) => {
      if (window.YT?.Player) return resolve();
      window.onYouTubeIframeAPIReady = () => resolve();
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        api = undefined;
        reject(Error("YouTube could not load. Check your connection."));
      };
      document.head.append(script);
    });
  return api;
}
export function parseVideo(value: string) {
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (
      ![
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "www.youtube-nocookie.com",
      ].includes(url.hostname)
    )
      return "";
    return url.hostname === "youtu.be"
      ? url.pathname.slice(1).split("/")[0]
      : url.searchParams.get("v") ||
          url.pathname.match(/\/(?:embed|shorts)\/([\w-]{11})/)?.[1] ||
          "";
  } catch {
    return "";
  }
}
export function SongPlayer({
  song,
  artistName,
  source,
  active,
  volume,
  onActivate,
  onEdit,
}: {
  song: Song;
  artistName: string;
  source: SourceOverride;
  active: boolean;
  volume: number;
  onActivate: () => void;
  onEdit: () => void;
}) {
  const mount = useRef<HTMLDivElement>(null),
    player = useRef<PlayerAPI | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [backup, setBackup] = useState(false),
    [blocked, setBlocked] = useState(false);
  const id = backup
    ? source.backup || song.backupYoutubeId
    : source.primary || song.youtubeId;
  const primary = source.primary || song.youtubeId;
  const unavailable = !id || Boolean(error);
  const watchId = unavailable ? primary || id : id;
  const watchParams = watchId ? new URLSearchParams({ v: watchId }) : null;
  if (watchParams && source.start && source.start > 0) {
    watchParams.set("t", String(Math.floor(source.start)));
  }
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => setBackup(false), [source.primary, song.youtubeId]);
  useEffect(() => {
    let disposed = false;
    setReady(false);
    setError("");
    setBlocked(false);
    if (!id) return;
    const element = document.createElement("iframe");
    const params = new URLSearchParams({
      enablejsapi: "1",
      origin: location.origin,
      playsinline: "1",
      rel: "0",
      start: String(source.start || 0),
    });
    element.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?${params}`;
    element.title = `${song.title} – YouTube player`;
    element.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    element.allowFullscreen = true;
    element.referrerPolicy = "strict-origin-when-cross-origin";
    mount.current?.replaceChildren(element);
    loadApi()
      .then(() => {
        if (disposed || !window.YT) return;
        player.current = new window.YT.Player(element, {
          events: {
            onReady: () => {
              if (disposed) return;
              setReady(true);
              player.current?.setVolume(volume);
              if (activeRef.current) player.current?.playVideo();
            },
            onError: (event: { data: number }) => {
              if (disposed) return;
              if (!backup && (source.backup || song.backupYoutubeId)) {
                setBackup(true);
                return;
              }
              setError(
                event.data === 153
                  ? "YouTube could not verify this browser for embedded playback."
                  : event.data === 101 || event.data === 150
                    ? "YouTube blocked this upload from playing here."
                    : "This video is unavailable here.",
              );
            },
            onAutoplayBlocked: () => setBlocked(true),
            onStateChange: (event: { data: number }) => {
              if (event.data === 1) onActivate();
            },
          },
        });
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      player.current?.destroy();
      player.current = null;
    };
  }, [id]);
  useEffect(() => {
    if (!ready) return;
    if (active) player.current?.playVideo();
    else player.current?.pauseVideo();
  }, [active, ready]);
  useEffect(() => {
    player.current?.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    if (ready && source.start) player.current?.seekTo(source.start, true);
  }, [source.start, ready]);
  return (
    <>
      <div
        className="video"
        ref={mount}
        style={unavailable ? { display: "none" } : undefined}
      />
      {unavailable && (
        <div className="video video-empty">
          {primary && (
            <img
              className="video-fallback-art"
              alt=""
              src={`https://i.ytimg.com/vi/${primary}/hqdefault.jpg`}
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          )}
          <Play size={36} />
          <strong>{error || "No video linked yet"}</strong>
          {!watchParams && (
            <button className="small-button" onClick={onEdit}>
              <Link2 size={13} /> Add link
            </button>
          )}
        </div>
      )}
      {blocked && !unavailable && (
        <button
          className="play-prompt"
          onClick={() => {
            onActivate();
            player.current?.playVideo();
            setBlocked(false);
          }}
        >
          <Play size={13} /> Click to enable sound
        </button>
      )}
      <div className="source-tools">
        <button
          disabled={!ready || unavailable}
          onClick={() => {
            player.current?.seekTo(0, true);
          }}
          title="Play from the beginning"
        >
          <RotateCcw size={13} /> Restart
        </button>
        <a
          href={
            watchParams
              ? `https://www.youtube.com/watch?${watchParams}`
              : `https://www.youtube.com/results?${new URLSearchParams({ search_query: `${artistName} ${song.title} official audio` })}`
          }
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${watchParams ? "Open" : "Search"} on YouTube: ${song.title} (new tab)`}
        >
          <ExternalLink size={13} />{" "}
          {watchParams ? "Open on YouTube" : "Search YouTube"}
        </a>
      </div>
    </>
  );
}
