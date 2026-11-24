"use client";
import { useEffect, useRef } from "react";
import type { IncidentInput, PresetConfig } from "@cbt/contracts/exams";

/**
 * Strict mode via Page Visibility API + fullscreen + blur events.
 * 'off' attaches nothing; 'warn' and 'strict' log incidents (server decides flagging by threshold).
 * Strict also blocks copy/paste/context menu. Reports back so the UI can show a warning banner.
 */
export function useStrictMode(opts: {
  enabled: boolean;
  level: PresetConfig["strictLevel"];
  onIncident: (i: IncidentInput) => void;
}) {
  const { enabled, level, onIncident } = opts;
  const cb = useRef(onIncident);
  cb.current = onIncident;

  useEffect(() => {
    if (!enabled || level === "off" || typeof document === "undefined") return;
    let hiddenAt: number | null = null;
    const emit = (type: IncidentInput["type"], durationMs?: number, detail?: string) =>
      cb.current({ type, occurredAt: new Date().toISOString(), durationMs, detail });

    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt) { emit("tab_hidden", Date.now() - hiddenAt); hiddenAt = null; }
    };
    const onBlur = () => { if (document.visibilityState === "visible") emit("window_blur"); };
    const onFs = () => { if (!document.fullscreenElement) emit("fullscreen_exit"); };
    const block = (type: IncidentInput["type"]) => (e: Event) => { if (level === "strict") { e.preventDefault(); emit(type); } };
    const onCopy = block("copy_paste"), onCtx = block("context_menu");

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onCopy);
    document.addEventListener("contextmenu", onCtx);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onCopy);
      document.removeEventListener("contextmenu", onCtx);
    };
  }, [enabled, level]);
}

export function requestFullscreen() {
  try { void document.documentElement.requestFullscreen?.(); } catch { /* user gesture required */ }
}
