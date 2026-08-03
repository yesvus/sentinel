"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";

export function StatsReveal() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [80, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [0, 1]);

  return (
    <section ref={ref} className="px-6 py-24 md:py-32">
      <div className="max-w-4xl mx-auto flex flex-col items-center gap-12">
        <h2 className="text-3xl font-bold tracking-tight text-center text-balance md:text-4xl">
          A week of your work, at a glance.
        </h2>
        <motion.div style={{ y, opacity }} className="w-full max-w-lg">
          <Card>
            <CardContent className="grid grid-cols-2 gap-6 p-8">
              <div className="text-center">
                <p className="text-3xl font-bold tabular-nums">12</p>
                <p className="text-muted-foreground text-sm mt-1">
                  sessions this week
                </p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold tabular-nums">18.5h</p>
                <p className="text-muted-foreground text-sm mt-1">
                  focused time
                </p>
              </div>
              <div className="col-span-2">
                <div className="flex h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-chart-1 h-full"
                    style={{ width: "60%" }}
                  />
                  <div
                    className="bg-chart-2 h-full"
                    style={{ width: "40%" }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>Learning 60%</span>
                  <span>Producing 40%</span>
                </div>
              </div>
              <div className="col-span-2 text-center">
                <p className="text-muted-foreground text-sm">
                  <span className="tabular-nums font-medium text-foreground">
                    5
                  </span>{" "}
                  day streak
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}