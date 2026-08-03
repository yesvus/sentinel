"use client";

import { motion } from "framer-motion";
import { DemoTimer } from "./demo-timer";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE = [0.25, 0.1, 0.25, 1] as const;

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

export function HeroSection() {
  return (
    <section className="flex flex-col items-center gap-8 px-6 pt-24 pb-16 md:pt-32 md:pb-24 text-center">
      <motion.div
        variants={container}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center gap-6"
      >
        <motion.h1
          variants={item}
          className="text-5xl font-bold tracking-tight md:text-7xl text-balance"
        >
          One timer. All your work.
        </motion.h1>
        <motion.p
          variants={item}
          className="text-muted-foreground text-lg md:text-xl max-w-md text-balance"
        >
          See what you actually spend your time on.
        </motion.p>
        <motion.div variants={item} className="w-full">
          <DemoTimer />
        </motion.div>
        <motion.div variants={item}>
          <Link
            href="/demo-login"
            className={cn(
              buttonVariants({ size: "lg" }),
              "rounded-full"
            )}
          >
            Try the demo &rarr;
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}