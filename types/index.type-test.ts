import type { VerificationRowCount } from './index';

const validSampleEstimate: VerificationRowCount['method'] = 'deterministic_sample_estimate(10)';

// @ts-expect-error The backend accepts positive integer sample sizes only.
const zeroSampleEstimate: VerificationRowCount['method'] = 'deterministic_sample_estimate(0)';
// @ts-expect-error The backend rejects negative sample sizes.
const negativeSampleEstimate: VerificationRowCount['method'] = 'deterministic_sample_estimate(-1)';
// @ts-expect-error The backend rejects fractional sample sizes.
const fractionalSampleEstimate: VerificationRowCount['method'] = 'deterministic_sample_estimate(1.5)';

void validSampleEstimate;
void zeroSampleEstimate;
void negativeSampleEstimate;
void fractionalSampleEstimate;
