import type {Manifest, VerifiedSample} from './types';
import {isVerifiedSample} from './verifier';

export interface PreviewRenderer {
  mount(metadata: Manifest, sample: VerifiedSample): void;
  clear(): void;
  dispose(): void;
}
/** No module/asset fetch for an unimplemented type. Only cryptographically
 * verified handles are publishable, and handles remain in memory. */
export function tableRenderer(publish: (sample: VerifiedSample | null) => void): PreviewRenderer {
  let disposed = false;
  return {
    mount(metadata, sample) {
      if (disposed || metadata.preview_type !== 'table' || !isVerifiedSample(sample) || sample.manifest !== metadata) {publish(null); return;}
      publish(sample);
    },
    clear() {publish(null);},
    dispose() {disposed = true; publish(null);},
  };
}
