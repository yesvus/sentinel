"use client";

import { motion } from "framer-motion";
import { FolderKanban, BarChart3, User } from "lucide-react";

const EASE = [0.25, 0.1, 0.25, 1] as const;

const features = [
  {
    icon: FolderKanban,
    title: "Track projects",
    description: "Organize sessions by what you're working on.",
  },
  {
    icon: BarChart3,
    title: "See your stats",
    description: "Learning vs producing. Streaks. Weekly summaries.",
  },
  {
    icon: User,
    title: "Work your way",
    description: "Solo. Self-directed. No teams, no noise.",
  },
];

const container = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.3 },
  },
};

const card = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

export function FeatureStrip() {
  return (
    <section className="px-6 py-24 md:py-32">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="grid grid-cols-1 gap-8 md:grid-cols-3 max-w-4xl mx-auto"
      >
        {features.map((feature) => (
          <motion.div
            key={feature.title}
            variants={card}
            className="flex flex-col items-center gap-3 text-center"
          >
            <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-xl">
              <feature.icon className="size-5" />
            </div>
            <h3 className="text-lg font-semibold">{feature.title}</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}