import type { DiscoveryResult, RawLinkedInEntity, StructuredProfile } from "../types.js";
import { discoverPublicProfileEvidence } from "../providers/exa.js";
import { synthesizeStructuredProfile } from "../providers/openai.js";

export interface EnrichmentResult {
  discovery?: DiscoveryResult;
  structuredProfile?: StructuredProfile;
}

export interface EnrichmentOptions {
  enableDiscovery?: boolean;
  enableSynthesis?: boolean;
}

export async function enrichProfile(
  entity: RawLinkedInEntity,
  prefetchedDiscovery?: DiscoveryResult | Promise<DiscoveryResult | undefined>,
  options?: EnrichmentOptions
): Promise<EnrichmentResult> {
  const discovery = options?.enableDiscovery === false
    ? undefined
    : prefetchedDiscovery
      ? await prefetchedDiscovery
      : await discoverPublicProfileEvidence(entity);
  const structuredProfile = options?.enableSynthesis === false
    ? undefined
    : await synthesizeStructuredProfile(entity, discovery);

  return {
    discovery,
    structuredProfile
  };
}
