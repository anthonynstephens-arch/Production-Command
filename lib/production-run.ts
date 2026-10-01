export type ProductionStage = "scheduled" | "printing" | "drying" | "packaging" | "completed";
export type MixKey = "whatupdoe" | "did_you_call_first" | "upside_down_welcome" | "marsh_supply";
export type Plan = Record<MixKey, number> & {
  run_id: string; stage: ProductionStage; scheduled_date: string; scheduled_time: string; updated_at: string;
  printing_started_at: string | null; drying_started_at: string | null; drying_ends_at: string | null;
  packaging_started_at: string | null; completed_at: string | null; server_now: string;
};
export const stageLabels: Record<ProductionStage, string> = {
  scheduled: "SCHEDULED", printing: "PRINTING", drying: "DRYING",
  packaging: "PACKAGING FOR SHIPMENT", completed: "COMPLETED"
};
export function stageAt(plan: Plan, now: number): ProductionStage {
  return plan.stage === "drying" && plan.drying_ends_at && Date.parse(plan.drying_ends_at) <= now
    ? "packaging" : plan.stage;
}
export function dryingSeconds(plan: Plan, now: number) {
  return Math.max(0, Math.ceil(((plan.drying_ends_at ? Date.parse(plan.drying_ends_at) : now) - now) / 1000));
}
export function countdownText(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
}
