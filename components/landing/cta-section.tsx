"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE = [0.25, 0.1, 0.25, 1] as const;

export function CTASection() {
  return (
    <section className="px-6 py-24 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex flex-col items-center gap-6 text-center"
      >
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl text-balance">
          Start tracking your time.
          <br />
          It&rsquo;s free.
        </h2>
        <div className="flex items-center gap-4">
          <Link
            href="/demo-login"
            className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
          >
            Try the demo
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "rounded-full"
            )}
          >
            Sign up
          </Link>
        </div>
      </motion.div>
    </section>
  );
}