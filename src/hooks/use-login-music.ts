import { useCallback, useEffect, useRef, useState } from "react";
import { LoginMusicPlayer, readMusicPreference, writeMusicPreference } from "@/lib/login-music";

const GESTURES = ["pointerdown", "keydown", "touchstart"] as const;

/**
 * Für Elise on the login page. The visitor's on/off choice is remembered (default on).
 * Browsers block sound until the first click, tap or key press, so when music is on we try
 * straight away and otherwise start on that first gesture. Silent while the tab is hidden.
 */
export function useLoginMusic() {
  const [supported, setSupported] = useState(false);
  const [wanted, setWanted] = useState(false);
  const [audible, setAudible] = useState(false);
  const playerRef = useRef<LoginMusicPlayer | null>(null);
  const wantedRef = useRef(false);

  const tryStart = useCallback(async () => {
    const player = (playerRef.current ??= new LoginMusicPlayer());
    const ok = await player.start();
    // The visitor may have muted while the context was resuming.
    if (!wantedRef.current) {
      player.stop();
      setAudible(false);
      return false;
    }
    setAudible(ok);
    return ok;
  }, []);

  useEffect(() => {
    if (!LoginMusicPlayer.isSupported()) return;
    setSupported(true);
    const initial = readMusicPreference();
    wantedRef.current = initial;
    setWanted(initial);

    const removeGestures = () => {
      for (const g of GESTURES) document.removeEventListener(g, onGesture, true);
    };
    function onGesture() {
      if (!wantedRef.current) {
        removeGestures();
        return;
      }
      void tryStart().then((ok) => {
        if (ok) removeGestures();
      });
    }

    if (initial && !document.hidden) {
      void tryStart();
    }
    for (const g of GESTURES) document.addEventListener(g, onGesture, true);

    const onVisibility = () => {
      const player = playerRef.current;
      if (!player) return;
      if (document.hidden) void player.suspend();
      else if (wantedRef.current) void player.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      removeGestures();
      document.removeEventListener("visibilitychange", onVisibility);
      void playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, [tryStart]);

  const toggle = useCallback(() => {
    const next = !wantedRef.current;
    wantedRef.current = next;
    setWanted(next);
    writeMusicPreference(next);
    if (next) {
      void tryStart();
    } else {
      playerRef.current?.stop();
      setAudible(false);
    }
  }, [tryStart]);

  return { supported, wanted, audible, toggle };
}
