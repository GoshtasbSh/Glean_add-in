import { z } from "zod";

// Skeletons only this session — A2/A3 tighten the unknowns (plan §3.7).

export const ProfileV1 = z.object({
  version: z.literal(1),
  updated_at: z.string(),
  style_clusters: z.array(z.unknown()),
  formality_prior: z.unknown().nullable(),
  exemplars: z.array(z.unknown()),
  watermarks: z.record(z.string(), z.string()),
});
export type Profile = z.infer<typeof ProfileV1>;

export const SettingsV1 = z.object({
  version: z.literal(1),
  category_map: z.record(z.string(), z.string()),
  project_rules: z.array(z.unknown()),
});
export type Settings = z.infer<typeof SettingsV1>;
