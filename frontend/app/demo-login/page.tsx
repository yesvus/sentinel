"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const DEMO_EMAIL = "really_hardworking_man@yesvus.com";
const DEMO_PASSWORD = "IWorkTooMuch123";

const MESSAGES = [
  "logging in as a really hardworking man...",
  "warming up yesterday's coffee...",
  "pretending to read the docs...",
  "loading 45 days of totally real hustle...",
];

export default function DemoLoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [message, setMessage] = useState(MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % MESSAGES.length;
      setMessage(MESSAGES[i]);
    }, 900);

    auth
      .login(DEMO_EMAIL, DEMO_PASSWORD)
      .then(async () => {
        await refresh();
        router.push("/app");
      })
      .catch(() => setError("guy's probably on a coffee break. try again in a bit."))
      .finally(() => clearInterval(interval));

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <p
        className="text-primary text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-wordmark)", fontWeight: 800 }}
      >
        Sentinel
      </p>
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : (
        <p className="text-muted-foreground text-sm">{message}</p>
      )}
    </div>
  );
}
