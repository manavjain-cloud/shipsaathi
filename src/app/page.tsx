import { PortalHero } from "@/components/landing/portal-hero";
import { Landing } from "@/components/landing/landing";
import { DEFAULT_RATE_CARD, DEFAULT_RULEBOOK } from "@/lib/domain/validation";

export default function OverviewPage() {
  const destinations = [...new Set(DEFAULT_RATE_CARD.map((o) => o.destinationCountry))];
  const code: Record<string, string> = { Germany: "DE", France: "FR", Netherlands: "NL" };
  return (
    <main className="overflow-x-clip bg-ground">
      <PortalHero routes={`UK → ${destinations.map((d) => code[d] ?? d).join(" · ")}`} services={DEFAULT_RATE_CARD.length} />
      <Landing rateCard={DEFAULT_RATE_CARD} rulebook={DEFAULT_RULEBOOK} />
    </main>
  );
}
