import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { FeatureStrip } from "@/components/landing/feature-strip";
import { StatsReveal } from "@/components/landing/stats-reveal";
import { AudienceSection } from "@/components/landing/audience-section";
import { CTASection } from "@/components/landing/cta-section";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <LandingNav />
      <main>
        <HeroSection />
        <FeatureStrip />
        <StatsReveal />
        <AudienceSection />
        <CTASection />
      </main>
      <footer className="py-8 text-center text-muted-foreground text-sm">
        Sentinel &middot; &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}