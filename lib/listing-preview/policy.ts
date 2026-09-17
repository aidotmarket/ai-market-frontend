import type {VerifiedEntry} from './types';

/** No approved browser implementation of the pinned Presidio/spaCy detector is
 * supplied by Chunk 2. A signed producer scan cannot replace the independent
 * viewer scan. Keep this boundary closed until its browser artifact is approved.
 * Never call a server detector: that would create row ingress. */
export async function scanLocalPreview(_entries: readonly VerifiedEntry[], _signal: AbortSignal): Promise<void> {
  throw new Error('detector_unavailable');
}
