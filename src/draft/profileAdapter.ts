/**
 * Map a trained `ProfileV1` (what A3's fitVoice writes) → the pipeline's
 * `DraftProfile` (what runDraft consumes): pick the recipient's dominant cluster,
 * build the tiered exemplar pools, derive the voice-synthesis line. Shared by
 * the free pane (session store) and the Graph demo — the same mapping either way.
 */
import type { DraftProfile } from "./pipeline";
import { predictRegister } from "./pipeline";
import type { RelationshipCard } from "./wrap";
import type { Profile } from "../store/schemas";
import { buildExemplarPools, voiceSynthesisLine } from "../intel/pools";

export function toDraftProfile(
  profile: Profile,
  recipientHash: string,
  card: RelationshipCard | null
): DraftProfile {
  const register = predictRegister(card);
  let dominant = profile.style_clusters[0];
  if (card?.clusterHist) {
    const top = Object.entries(card.clusterHist).sort((a, b) => b[1] - a[1])[0];
    dominant = profile.style_clusters.find((c) => c.id === Number(top?.[0])) ?? dominant;
  }
  return {
    summary: profile.summary,
    bannedPhrases: profile.bannedPhrases,
    userSignoffs: profile.userSignoffs,
    userFullName: profile.userFullName,
    exemplarPools: buildExemplarPools(profile.exemplars, recipientHash, register, card?.clusterHist),
    voiceSynthesis: dominant ? voiceSynthesisLine(dominant) : undefined,
  };
}
