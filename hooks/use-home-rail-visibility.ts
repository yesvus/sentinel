import { useEffect, useRef, useState } from "react";

export type HomeLayoutPhase = "planning" | "planning-exit" | "active" | "active-exit";

type HomeRailVisibilityOptions = {
  isRunning: boolean;
  isMobile: boolean;
  setSidebarOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
};

type TransitionCallbacks = {
  before?: () => void;
  success?: () => void;
  failure?: () => void;
};

const EXIT_MS = 120;

function reducedMotionPreferred() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function useHomeRailVisibility({
  isRunning,
  isMobile,
  setSidebarOpen,
  setMobileSidebarOpen,
}: HomeRailVisibilityOptions) {
  const [phase, setPhase] = useState<HomeLayoutPhase>(() => isRunning ? "active" : "planning");
  const previousRunningRef = useRef(isRunning);
  const coordinatedMutationRef = useRef(false);
  const transitionSequenceRef = useRef(0);

  function closeNavigation() {
    if (isMobile) setMobileSidebarOpen(false);
    else setSidebarOpen(false);
  }

  async function transitionExternalChange(target: "planning" | "active") {
    const sequence = ++transitionSequenceRef.current;
    if (target === "active") closeNavigation();
    if (reducedMotionPreferred()) {
      setPhase(target);
      return;
    }
    setPhase(target === "active" ? "planning-exit" : "active-exit");
    await delay(EXIT_MS);
    if (sequence === transitionSequenceRef.current) setPhase(target);
  }

  async function transitionMutation(
    target: "planning" | "active",
    action: () => Promise<boolean>,
    callbacks: TransitionCallbacks = {},
  ) {
    const source = target === "active" ? "planning" : "active";
    const exiting = target === "active" ? "planning-exit" : "active-exit";
    const sequence = ++transitionSequenceRef.current;
    coordinatedMutationRef.current = true;
    callbacks.before?.();
    const runAction = async () => {
      try {
        return await action();
      } catch {
        return false;
      }
    };

    if (target === "active") {
      closeNavigation();
      if (reducedMotionPreferred()) {
        setPhase("active");
      } else {
        setPhase("planning-exit");
        void delay(EXIT_MS).then(() => {
          if (sequence === transitionSequenceRef.current) setPhase("active");
        });
      }
    }

    const succeeded = await runAction();
    if (!succeeded) {
      transitionSequenceRef.current += 1;
      coordinatedMutationRef.current = false;
      previousRunningRef.current = source === "active";
      setPhase(source);
      callbacks.failure?.();
      return false;
    }

    if (target === "active") {
      // The optimistic active layout is already visible while the server confirms the mutation.
    } else if (reducedMotionPreferred()) {
      setPhase(target);
    } else {
      setPhase(exiting);
      await delay(EXIT_MS);
      if (sequence === transitionSequenceRef.current) setPhase(target);
    }

    coordinatedMutationRef.current = false;
    previousRunningRef.current = target === "active";
    callbacks.success?.();
    return true;
  }

  useEffect(() => {
    if (previousRunningRef.current === isRunning) return;
    previousRunningRef.current = isRunning;
    if (!coordinatedMutationRef.current) void transitionExternalChange(isRunning ? "active" : "planning");
    // Sidebar setters change identity with sidebar state; they are only needed at transition time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isRunning]);

  return {
    phase,
    showPlanning: phase === "planning" || phase === "planning-exit",
    showActive: phase === "active" || phase === "active-exit",
    planningExiting: phase === "planning-exit",
    activeExiting: phase === "active-exit",
    start: (action: () => Promise<boolean>, callbacks?: TransitionCallbacks) => transitionMutation("active", action, callbacks),
    stop: (action: () => Promise<boolean>, callbacks?: TransitionCallbacks) => transitionMutation("planning", action, callbacks),
  };
}
