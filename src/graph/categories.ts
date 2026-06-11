import { graph as defaultGraph, type GraphFn } from "./client";

export interface OutlookCategory {
  id: string;
  displayName: string;
  color: string;
}

export async function listCategories(graphFn: GraphFn = defaultGraph): Promise<OutlookCategory[]> {
  const res = await graphFn<{ value: OutlookCategory[] }>("GET", "/me/outlook/masterCategories");
  return res.value;
}

export async function ensureCategory(
  name: string,
  preset: string,
  graphFn: GraphFn = defaultGraph
): Promise<OutlookCategory> {
  const existing = await listCategories(graphFn);
  const match = existing.find((c) => c.displayName.toLowerCase() === name.toLowerCase());
  if (match) return match;
  return graphFn<OutlookCategory>("POST", "/me/outlook/masterCategories", {
    body: { displayName: name, color: preset },
  });
}

export async function assignCategories(
  messageId: string,
  names: string[],
  graphFn: GraphFn = defaultGraph
): Promise<void> {
  await graphFn("PATCH", `/me/messages/${encodeURIComponent(messageId)}`, {
    body: { categories: names },
  });
}
