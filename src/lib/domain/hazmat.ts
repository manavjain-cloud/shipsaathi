/**
 * R-06 screening: lithium batteries, aerosols, flammable liquids.
 *
 * Deterministic keyword screen with three outcomes:
 *  - "prohibited": the description names a prohibited good outright → Red.
 *  - "review": the description could contain one (e.g. "battery", "perfume", "laptop") → human review.
 *  - "clear": nothing matched.
 * Negations such as "non-flammable" or "batteries not included" are removed before matching.
 * This is a screen, not a dangerous-goods classification.
 */

export type HazardCategory = "lithium battery" | "aerosol" | "flammable liquid";

export interface HazardMatch {
  level: "prohibited" | "review" | "clear";
  category?: HazardCategory;
  term?: string;
  reason: string;
}

const NEGATIONS: RegExp[] = [
  /\bnon[- ]?(in)?flammable\b/g,
  /\bnot (in)?flammable\b/g,
  /\bnon[- ]?aerosol\b/g,
  /\b(lithium|battery|batteries)[- ]free\b/g,
  /\bno (lithium|batteries|battery)\b/g,
  /\bwithout (a )?(lithium )?(batteries|battery)\b/g,
  /\b(batteries|battery) (are |is )?not included\b/g,
  /\b(laptop|phone|smartphone|tablet|ipad|iphone|camera)\s+(sleeve|case|cover|bag|stand|holder|mount|skin|screen protector|protector|strap|grip|pouch)s?\b/g,
  /\bpaint\s?(brush|brushes|roller|rollers|tray|trays)\b/g,
  /\bwater[- ]based\b[^,;]*/g,
  /\bempty\b[^,;]*/g,
];

interface Pattern {
  re: RegExp;
  category: HazardCategory;
  label: string;
}

const PROHIBITED: Pattern[] = [
  { re: /\blithium\b/, category: "lithium battery", label: "lithium" },
  { re: /\bli[- ]?ion\b/, category: "lithium battery", label: "Li-ion" },
  { re: /\bli[- ]?po(ly(mer)?)?\b/, category: "lithium battery", label: "Li-Po" },
  { re: /\blifepo4\b/, category: "lithium battery", label: "LiFePO4" },
  { re: /\bpower ?banks?\b/, category: "lithium battery", label: "power bank" },
  { re: /\b18650\b/, category: "lithium battery", label: "18650 cell" },
  { re: /\be-?cig(arette)?s?\b|\bvapes?\b|\bvape pens?\b/, category: "lithium battery", label: "e-cigarette / vape" },
  { re: /\baerosols?\b/, category: "aerosol", label: "aerosol" },
  { re: /\bspray ?(can|cans|paint|paints)\b/, category: "aerosol", label: "spray can" },
  { re: /\b(deodorant|hair|body|air freshener) spray\b|\bhairspray\b/, category: "aerosol", label: "aerosol spray" },
  { re: /\bcompressed (gas|air)\b/, category: "aerosol", label: "compressed gas" },
  { re: /\b(in)?flammable\b/, category: "flammable liquid", label: "flammable" },
  { re: /\bpetrol\b|\bgasoline\b|\bkerosene\b|\bdiesel fuel\b/, category: "flammable liquid", label: "fuel" },
  { re: /\bacetone\b/, category: "flammable liquid", label: "acetone" },
  { re: /\bturpentine\b|\bwhite spirit\b|\bmethylated spirits?\b|\bpaint thinners?\b|\bthinners?\b/, category: "flammable liquid", label: "solvent" },
  { re: /\blighter fluid\b|\blamp oil\b|\bparaffin oil\b/, category: "flammable liquid", label: "lighter / lamp fuel" },
  { re: /\bisopropyl alcohol\b|\bethanol\b|\bmethanol\b/, category: "flammable liquid", label: "alcohol solvent" },
  { re: /\bnail (polish|varnish)\b/, category: "flammable liquid", label: "nail polish" },
];

const REVIEW: Pattern[] = [
  { re: /\bbatter(y|ies)\b/, category: "lithium battery", label: "battery (chemistry not stated)" },
  { re: /\brechargeable\b|\bcordless\b|\bwireless (earbuds|headphones|speaker|mouse|keyboard)\b|\bbluetooth\b/, category: "lithium battery", label: "rechargeable device" },
  { re: /\b(laptop|notebook computer|smartphone|mobile phone|phone|tablet|smartwatch|smart watch|drone|e-?bike|electric scooter|e-?scooter|hoverboard)s?\b/, category: "lithium battery", label: "device that usually contains a lithium battery" },
  { re: /\bspray\b/, category: "aerosol", label: "spray (aerosol or pump not stated)" },
  { re: /\bgas (canister|cartridge|refill)s?\b|\bbutane\b|\bpropane\b|\blighters?\b/, category: "aerosol", label: "gas canister / lighter" },
  { re: /\bperfumes?\b|\bcolognes?\b|\beau de\b|\bfragrances?\b|\baftershave\b|\bbody mist\b/, category: "flammable liquid", label: "alcohol-based fragrance" },
  { re: /\bpaints?\b|\bvarnish(es)?\b|\blacquers?\b|\benamel paint\b|\bwood stain\b/, category: "flammable liquid", label: "paint / varnish" },
  { re: /\bglue\b|\badhesives?\b|\bresin\b|\bsolvents?\b/, category: "flammable liquid", label: "adhesive / solvent" },
  { re: /\bhand sanitis(er|ers)\b|\bhand saniti(z|s)er\b|\brubbing alcohol\b/, category: "flammable liquid", label: "alcohol-based sanitiser" },
  { re: /\b(vodka|whisky|whiskey|rum|gin|brandy|spirits|liqueur|tequila)\b/, category: "flammable liquid", label: "high-strength spirits" },
  { re: /\bessential oils?\b/, category: "flammable liquid", label: "essential oil" },
  { re: /\bfuel\b/, category: "flammable liquid", label: "fuel" },
];

export function stripNegations(text: string): string {
  let t = ` ${text.toLowerCase()} `;
  for (const re of NEGATIONS) t = t.replace(re, " ");
  return t;
}

export function screenDescription(description: string | null | undefined): HazardMatch {
  if (!description || !description.trim()) {
    return { level: "review", reason: "No description, so prohibited goods cannot be ruled out." };
  }
  const text = stripNegations(description);
  for (const p of PROHIBITED) {
    if (p.re.test(text)) {
      return {
        level: "prohibited",
        category: p.category,
        term: p.label,
        reason: `Description mentions "${p.label}", which is a ${p.category} — not allowed on this service.`,
      };
    }
  }
  for (const p of REVIEW) {
    if (p.re.test(text)) {
      return {
        level: "review",
        category: p.category,
        term: p.label,
        reason: `Description mentions "${p.label}" — it may be or contain a ${p.category}. A person needs to confirm.`,
      };
    }
  }
  return { level: "clear", reason: "No lithium battery, aerosol or flammable-liquid terms found." };
}

export function hazardKey(lineNo: number, description: string | null): string {
  return `${lineNo}:${(description ?? "").trim().toLowerCase()}`;
}
