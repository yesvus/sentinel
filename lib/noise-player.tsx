"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { FocusAudioType } from "@/lib/api";

const NOISE_CHANNEL = "sentinel-noise-sync";
const SESSION_CHANNEL = "sentinel-session-sync";
const STATE_KEY = "sentinel-noise-playing";
const OWNER_KEY = "sentinel-noise-owner";
const VOLUME_KEY = "sentinel-noise-volume";
const SOUND_KEY = "sentinel-focus-audio-type";
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
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
  level: number;
};

const NoiseContext = createContext<NoiseContextValue | null>(null);

function makeNoiseBuffer(context: AudioContext, type: Exclude<FocusAudioType, "binaural-40hz">) {
  const seconds = 4;
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let pink0 = 0;
  let pink1 = 0;
  let pink2 = 0;
  let brown = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const white = Math.random() * 2 - 1;
    pink0 = 0.99765 * pink0 + white * 0.099046;
    pink1 = 0.963 * pink1 + white * 0.2965164;
    pink2 = 0.57 * pink2 + white * 1.0526913;
    const pink = (pink0 + pink1 + pink2 + white * 0.1848) * 0.055;
    brown = (brown + white * 0.02) / 1.02;
    if (type === "white") samples[i] = white * 0.28;
    else if (type === "pink") samples[i] = pink;
    else if (type === "brown") samples[i] = brown * 2.4;
    else samples[i] = pink;
  }

  // Match the tail to the beginning so looping never introduces a click or gap.
  const crossfadeSamples = Math.min(128, Math.floor(samples.length / 8));
  for (let i = 0; i < crossfadeSamples; i += 1) {
    const mix = i / (crossfadeSamples - 1);
    const tailIndex = samples.length - crossfadeSamples + i;
    samples[tailIndex] = samples[tailIndex] * (1 - mix) + samples[0] * mix;
  }
  return buffer;
}

export function NoisePlayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.55);
  const volumeRef = useRef(0.55);
  const soundRef = useRef<FocusAudioType>("speech-blocker");
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
    nodes.gain.gain.linearRampToValueAtTime(0, now + 0.4);
    window.setTimeout(() => {
      for (const source of nodes.sources) {
        try { source.stop(); } catch {}
      }
      void nodes.context.close();
    }, 450);
  }, []);

  const startLocal = useCallback(() => {
    if (nodesRef.current) return;
    const context = new AudioContext();
    const gain = context.createGain();
    const sound = soundRef.current;
    const sources: AudioScheduledSourceNode[] = [];
    const level = sound === "binaural-40hz" ? 0.28 : 0.75;
    gain.gain.value = 0;

    if (sound === "binaural-40hz") {
      const left = context.createOscillator();
      const right = context.createOscillator();
      const merger = context.createChannelMerger(2);
      left.type = "sine";
      right.type = "sine";
      left.frequency.value = 180;
      right.frequency.value = 220;
      left.connect(merger, 0, 0);
      right.connect(merger, 0, 1);
      merger.connect(gain);
      left.start();
      right.start();
      sources.push(left, right);
    } else {
      const source = context.createBufferSource();
      source.buffer = makeNoiseBuffer(context, sound);
      source.loop = true;
      if (sound === "speech-blocker") {
        const highPass = context.createBiquadFilter();
        const lowSpeech = context.createBiquadFilter();
        const midSpeech = context.createBiquadFilter();
        const highSpeech = context.createBiquadFilter();
        const lowPass = context.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.value = 120;
        lowSpeech.type = "peaking";
        lowSpeech.frequency.value = 350;
        lowSpeech.Q.value = 0.65;
        lowSpeech.gain.value = 2;
        midSpeech.type = "peaking";
        midSpeech.frequency.value = 1100;
        midSpeech.Q.value = 0.55;
        midSpeech.gain.value = 7;
        highSpeech.type = "peaking";
        highSpeech.frequency.value = 2800;
        highSpeech.Q.value = 0.7;
        highSpeech.gain.value = 4;
        lowPass.type = "lowpass";
        lowPass.frequency.value = 6500;
        source
          .connect(highPass)
          .connect(lowSpeech)
          .connect(midSpeech)
          .connect(highSpeech)
          .connect(lowPass)
          .connect(gain);
      } else {
        source.connect(gain);
      }
      source.start();
      sources.push(source);
    }
    gain.connect(context.destination);
    const now = context.currentTime;
    gain.gain.linearRampToValueAtTime(volumeRef.current * level, now + 0.5);
    nodesRef.current = { context, sources, gain, level };
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
      nodes.gain.gain.setTargetAtTime(next * nodes.level, now, 0.08);
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
        if (nodes) nodes.gain.gain.setTargetAtTime(next * nodes.level, nodes.context.currentTime, 0.08);
      } else if (event.data?.type === "sound" && typeof event.data.sound === "string") {
        soundRef.current = event.data.sound as FocusAudioType;
        localStorage.setItem(SOUND_KEY, event.data.sound);
        if (nodesRef.current) {
          fadeOutLocal();
          window.setTimeout(startLocal, 50);
        }
      }
    });
    return () => {
      window.clearTimeout(initialization);
      channel.close();
      channelRef.current = null;
      fadeOutLocal();
    };
  }, [fadeOutLocal, startLocal]);

  useEffect(() => {
    const next = user?.focusAudioType ?? "speech-blocker";
    if (soundRef.current === next) return;
    soundRef.current = next;
    localStorage.setItem(SOUND_KEY, next);
    channelRef.current?.postMessage({ type: "sound", sound: next });
    if (nodesRef.current) {
      fadeOutLocal();
      const restart = window.setTimeout(startLocal, 50);
      return () => window.clearTimeout(restart);
    }
  }, [fadeOutLocal, startLocal, user?.focusAudioType]);

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
