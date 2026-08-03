"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";

const EASE = [0.25, 0.1, 0.25, 1] as const;

export function AudienceSection() {
  return (
    <section className="px-6 py-24 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.5, ease: EASE }}
        className="max-w-2xl mx-auto flex flex-col items-center gap-8 text-center"
      >
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl text-balance">
          Built for solo focus.
          <br />
          No teams, no noise.
        </h2>
        <Card className="w-full">
          <CardContent className="p-8">
            <blockquote className="text-muted-foreground text-lg italic leading-relaxed">
              &ldquo;I use it to balance university, freelance coding, and
              learning new things. My brother preps for his entrance exam with
              it. We both track our time and see where it goes.&rdquo;
            </blockquote>
          </CardContent>
        </Card>
      </motion.div>
    </section>
  );
}