/**
 * One booking data model shared by the chat path and the Excel path.
 * Field names mirror the template columns (Sheets 1 & 2).
 * `null` always means "not provided / could not be read" — never a guessed value.
 */

export const DESTINATION_TYPES = ["Warehouse", "Business address"] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];

export const SELLER_PRIORITIES = ["Cheapest", "Fastest", "Most reliable", "Balanced"] as const;
export type SellerPriority = (typeof SELLER_PRIORITIES)[number];

export interface Item {
  /** 1-based position within the booking (stable label for the UI). */
  lineNo: number;
  sku: string | null;
  description: string | null;
  /** Kept as text so leading zeros / dots are not lost. */
  hsCode: string | null;
  quantity: number | null;
  unitPrice: number | null;
  unitsPerCarton: number | null;
  cartons: number | null;
  unitWeightKg: number | null;
  countryOfOrigin: string | null;
  /** Excel row number, when the item came from a file. */
  sourceRow?: number;
}

export interface Booking {
  bookingId: string | null;
  sellerName: string | null;
  originCity: string | null;
  originCountry: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
  destinationType: DestinationType | null;
  /** ISO date YYYY-MM-DD. Displayed as DD-MM-YYYY like the template. */
  readyToShipDate: string | null;
  sellerPriority: SellerPriority | null;
  pallets: number | null;
  cartons: number | null;
  totalDeclaredValue: number | null;
  currency: string | null;
  totalGrossWeightKg: number | null;
  deliveryAppointmentBooked: boolean | null;
  items: Item[];

  /** Seller-chosen carrier option id (overrides the priority pick). */
  selectedCarrierId?: string | null;
  /** "lineNo:description" keys the seller has confirmed are not prohibited goods (review cases only). */
  hazardAcknowledgements?: string[];
  /** AI hazard opinions keyed by "lineNo:description" — can only escalate to review, never clear. */
  aiHazardFlags?: Record<string, AiHazardFlag>;
  /** Problems found while reading the source (raw values that could not be parsed, etc.). */
  sourceIssues?: DataIssue[];
  /** Excel row number of the booking. */
  sourceRow?: number;
  /** Carrier sheet from the uploaded workbook, kept only when it differs from the supplied template. */
  customRateCard?: CarrierOption[];
}

export type BookingField = Exclude<
  keyof Booking,
  "items" | "selectedCarrierId" | "hazardAcknowledgements" | "aiHazardFlags" | "sourceIssues" | "sourceRow" | "customRateCard"
>;
export type ItemField = Exclude<keyof Item, "lineNo" | "sourceRow">;

export interface AiHazardFlag {
  category: "lithium battery" | "aerosol" | "flammable liquid" | "uncertain";
  reason: string;
}

export interface DataIssue {
  scope: "booking" | "item";
  field: string;
  lineNo?: number;
  sku?: string | null;
  severity: "error" | "warning";
  message: string;
  raw?: string;
}

export interface CarrierOption {
  id: string;
  carrier: string;
  service: string;
  originCountry: string;
  destinationCountry: string;
  pricePerPallet: number;
  currency: string;
  transitDays: number;
  onTimeRate: number;
  maxWeightPerPalletKg: number;
}

export interface RuleDefinition {
  id: string;
  rule: string;
  severity: "Red" | "Amber";
}

export type RuleStatus = "pass" | "fail" | "review";

export interface Finding {
  ruleId: string;
  severity: "Red" | "Amber";
  status: Exclude<RuleStatus, "pass">;
  field: string;
  lineNo?: number;
  sku?: string | null;
  actual: string;
  expected: string;
  explanation: string;
  fix: string;
}

export interface RuleCheck {
  ruleId: string;
  rule: string;
  severity: "Red" | "Amber";
  status: RuleStatus;
  summary: string;
  findings: Finding[];
}

export interface CarrierEvaluation {
  option: CarrierOption;
  cost: number | null;
  eligible: boolean;
  ineligibleReason?: string;
  scores?: { cost: number; speed: number; reliability: number; balanced: number };
}

export interface CarrierPick {
  evaluation: CarrierEvaluation;
  tiedWith: string[];
}

export interface CarrierResult {
  routeFound: boolean;
  weightPerPalletKg: number | null;
  evaluations: CarrierEvaluation[];
  priority: SellerPriority | null;
  picks: {
    cheapest: CarrierPick | null;
    fastest: CarrierPick | null;
    mostReliable: CarrierPick | null;
    balanced: CarrierPick | null;
  };
  /** Best eligible option for the seller's priority. */
  recommended: CarrierPick | null;
  /** Top option for the priority before weight limits are applied. */
  preferredIgnoringWeight: CarrierEvaluation | null;
  /** The carrier R-05 is checked against: seller selection, else the priority pick. */
  chosen: CarrierEvaluation | null;
  chosenSource: "seller-selected" | "priority" | "none";
  explanation: string;
  tradeoffs: string[];
  notes: string[];
}

export type BookingStatus = "blocked" | "review" | "warnings" | "ready";

export interface Assessment {
  status: BookingStatus;
  dispatchReady: boolean;
  counts: { red: number; amber: number; review: number; dataErrors: number; dataWarnings: number };
  checks: RuleCheck[];
  dataIssues: DataIssue[];
  carrier: CarrierResult;
  totals: {
    itemValue: number | null;
    itemCartons: number | null;
    netWeightKg: number | null;
    weightPerPalletKg: number | null;
  };
  evaluatedOn: string;
  disclaimer: string;
}
