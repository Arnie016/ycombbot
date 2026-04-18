import type { DiscoveryResult, RawLinkedInEntity, StructuredProfile } from "../types.js";
import { discoverPublicProfileEvidence } from "../providers/exa.js";
import { synthesizeStructuredProfile } from "../providers/openai.js";

export interface EnrichmentResult {
  discovery?: DiscoveryResult;
  structuredProfile?: StructuredProfile;
}

export async function enrichProfile(
  entity: RawLinkedInEntity,
  prefetchedDiscovery?: DiscoveryResult | Promise<DiscoveryResult | undefined>
): Promise<EnrichmentResult> {
  const discovery = prefetchedDiscovery
    ? await prefetchedDiscovery
    : await discoverPublicProfileEvidence(entity);
  const structuredProfile = await synthesizeStructuredProfile(entity, discovery);

  return {
    discovery,
    structuredProfile
  };
}
