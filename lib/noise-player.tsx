"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const NOISE_CHANNEL = "sentinel-noise-sync";
const SESSION_CHANNEL = "sentinel-session-sync";
const STATE_KEY = "sentinel-noise-playing";
const OWNER_KEY = "sentinel-noise-owner";
const VOLUME_KEY = "sentinel-noise-volume";
export const NOISE_SESSION_EVENT = "sentinel-session-audio";

type NoiseContextValue = {
  playing: boolean;
  volume: number;
  setVolume: (volume: number) => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
};

type AudioNodes = {
  context: AudioContext;
  source: AudioBufferSourceNode;
  gain: GainNode;
};

const NoiseContext = createContext<NoiseContextValue | null>(null);

function makeSpeechMask(context: AudioContext) {
  const seconds = 8;
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let pink0 = 0;
  let pink1 = 0;
  let pink2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const white = Math.random() * 2 - 1;
    pink0 = 0.99765 * pink0 + white * 0.099046;
    pink1 = 0.963 * pink1 + white * 0.2965164;
    pink2 = 0.57 * pink2 + white * 1.0526913;
    const pink = pink0 + pink1 + pink2 + white * 0.1848;
    // Gentle, irregular movement keeps the mask from sounding like static.
    const swell = 0.82 + 0.1 * Math.sin(i / context.sampleRate * 1.7) + 0.08 * Math.sin(i / context.sampleRate * 0.31);
    samples[i] = Math.max(-1, Math.min(1, pink * 0.055 * swell));
  }
  return buffer;
}

export function NoisePlayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.55);
  const volumeRef = useRef(0.55);
  const idRef = useRef("");
  const nodesRef = useRef<AudioNodes | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const fadeOutLocal = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    nodesRef.current = null;
    const now = nodes.context.currentTime;
    nodes.gain.gain.cancelScheduledValues(now);
    nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
    nodes.gain.gain.linearRampToValueAtTime(0, now + 1.5);
    window.setTimeout(() => {
      try { nodes.source.stop(); } catch {}
      void nodes.context.close();
    }, 1600);
  }, []);

  const startLocal = useCallback(() => {
    if (nodesRef.current) return;
    const context = new AudioContext();
    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const presence = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = makeSpeechMask(context);
    source.loop = true;
    highPass.type = "highpass";
    highPass.frequency.value = 180;
    lowPass.type = "lowpass";
    lowPass.frequency.value = 5200;
    presence.type = "peaking";
    presence.frequency.value = 1700;
    presence.Q.value = 0.7;
    presence.gain.value = 3;
    gain.gain.value = 0;
    source.connect(highPass).connect(lowPass).connect(presence).connect(gain).connect(context.destination);
    source.start();
    const now = context.currentTime;
    gain.gain.linearRampToValueAtTime(volumeRef.current * 0.75, now + 2);
    nodesRef.current = { context, source, gain };
    void context.resume();
  }, []);

  const claimAndStart = useCallback(() => {
    const owner = { id: idRef.current, heartbeat: Date.now() };
    localStorage.setItem(OWNER_KEY, JSON.stringify(owner));
    localStorage.setItem(STATE_KEY, "true");
    setPlaying(true);
    startLocal();
    channelRef.current?.postMessage({ type: "started", owner: owner.id });
  }, [startLocal]);

  const stop = useCallback(() => {
    localStorage.setItem(STATE_KEY, "false");
    localStorage.removeItem(OWNER_KEY);
    setPlaying(false);
    fadeOutLocal();
    channelRef.current?.postMessage({ type: "stopped" });
  }, [fadeOutLocal]);

  const start = useCallback(() => claimAndStart(), [claimAndStart]);

  const setVolume = useCallback((nextVolume: number) => {
    const next = Math.max(0, Math.min(1, nextVolume));
    volumeRef.current = next;
    setVolumeState(next);
    localStorage.setItem(VOLUME_KEY, String(next));
    const nodes = nodesRef.current;
    if (nodes) {
      const now = nodes.context.currentTime;
      nodes.gain.gain.cancelScheduledValues(now);
      nodes.gain.gain.setTargetAtTime(next * 0.75, now, 0.08);
    }
    channelRef.current?.postMessage({ type: "volume", volume: next });
  }, []);

  useEffect(() => {
    idRef.current = crypto.randomUUID();
    const storedVolume = Number(localStorage.getItem(VOLUME_KEY));
    const initialPlaying = localStorage.getItem(STATE_KEY) === "true";
    const initialVolume =
      Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1
        ? storedVolume
        : volumeRef.current;
    volumeRef.current = initialVolume;
    const initialization = window.setTimeout(() => {
      setPlaying(initialPlaying);
      setVolumeState(initialVolume);
    }, 0);
    const channel = new BroadcastChannel(NOISE_CHANNEL);
    channelRef.current = channel;

    channel.addEventListener("message", (event) => {
      if (event.data?.type === "started") {
        setPlaying(true);
        if (event.data.owner !== idRef.current) fadeOutLocal();
      } else if (event.data?.type === "stopped") {
        setPlaying(false);
        fadeOutLocal();
      } else if (event.data?.type === "volume" && typeof event.data.volume === "number") {
        const next = Math.max(0, Math.min(1, event.data.volume));
        volumeRef.current = next;
        setVolumeState(next);
        const nodes = nodesRef.current;
        if (nodes) nodes.gain.gain.setTargetAtTime(next * 0.75, nodes.context.currentTime, 0.08);
      }
    });
    return () => {
      window.clearTimeout(initialization);
      channel.close();
      channelRef.current = null;
      fadeOutLocal();
    };
  }, [fadeOutLocal]);

  useEffect(() => {
    if (!user?.autoStartNoise) return;
    const sessionChannel = new BroadcastChannel(SESSION_CHANNEL);
    const onSession = (event: MessageEvent) => {
      if (event.data?.type === "started") setPlaying(true);
      if (event.data?.type === "stopped") stop();
    };
    const onLocalSession = (event: Event) => {
      const action = (event as CustomEvent<"started" | "stopped">).detail;
      if (action === "started") claimAndStart();
      else stop();
    };
    sessionChannel.addEventListener("message", onSession);
    window.addEventListener(NOISE_SESSION_EVENT, onLocalSession);
    return () => {
      sessionChannel.close();
      window.removeEventListener(NOISE_SESSION_EVENT, onLocalSession);
    };
  }, [claimAndStart, stop, user?.autoStartNoise]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (nodesRef.current) {
        localStorage.setItem(OWNER_KEY, JSON.stringify({ id: idRef.current, heartbeat: Date.now() }));
        return;
      }
      if (document.visibilityState !== "visible" || localStorage.getItem(STATE_KEY) !== "true") return;
      try {
        const owner = JSON.parse(localStorage.getItem(OWNER_KEY) || "null") as { heartbeat?: number } | null;
        if (!owner?.heartbeat || Date.now() - owner.heartbeat > 5000) claimAndStart();
      } catch {
        claimAndStart();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [claimAndStart]);

  return (
    <NoiseContext.Provider value={{ playing, volume, setVolume, start, stop, toggle: playing ? stop : start }}>
      {children}
    </NoiseContext.Provider>
  );
}

export function useNoisePlayer() {
  const context = useContext(NoiseContext);
  if (!context) throw new Error("useNoisePlayer must be used within NoisePlayerProvider");
  return context;
}
