import type { CreateEventRepairRequest, EventRepairItem, EventRepairOperation, EventRepairOperationsResponse } from "./typesGenerated";

export type AdminEventRepairCreateRequest = CreateEventRepairRequest;
export type AdminEventRepairItem = EventRepairItem;
export type AdminEventRepairOperation = EventRepairOperation;
export type AdminEventRepairList = EventRepairOperationsResponse;

export const eventRepairKey = ["admin", "event-repairs"] as const;
export const eventRepairURL = "/api/v1/admin/event-repairs";
export function isRepairActive(state?: string) {
  return state === "dry_running" || state === "applying";
}
export async function repairRequest<T>(path = "", body?: AdminEventRepairCreateRequest | "apply" | "cancel" | "retry"): Promise<T> {
  const response = await fetch(`${eventRepairURL}${path}`, body === undefined ? undefined : {
    method: "POST",
    ...(typeof body === "object" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message || `Event repair request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export interface RepairSelection {
  mode: "single" | "sweep";
  instance: string;
  tenant: string;
  limit: string;
  realm: string;
  after: string;
  before: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function buildRepairRequest(form: RepairSelection): AdminEventRepairCreateRequest {
  const operation = "razorgore-phase-two" as const;
  if (form.mode === "single") {
    if (!form.instance.trim()) throw new Error("Enter an instance URL, ID, or slug.");
    return { operation, instance: form.instance.trim() };
  }
  if (!uuid.test(form.tenant.trim())) throw new Error("Enter an explicit tenant UUID for the sweep.");
  const limit = Number(form.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Sweep limit must be an integer from 1 to 1000.");
  if (form.realm && !uuid.test(form.realm.trim())) throw new Error("Realm must be a UUID.");
  for (const value of [form.after, form.before]) {
    if (value && !Number.isFinite(Date.parse(value))) throw new Error("Enter a valid date range.");
  }
  if (form.after && form.before && Date.parse(form.after) >= Date.parse(form.before)) throw new Error("After must be earlier than before.");
  return { operation, tenant_id: form.tenant.trim(), limit,
    ...(form.realm.trim() && { realm_id: form.realm.trim() }),
    ...(form.after && { after: new Date(form.after).toISOString() }),
    ...(form.before && { before: new Date(form.before).toISOString() }),
  };
}
