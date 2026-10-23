import { afterAll, it } from 'vitest';
import probe from './page.lifecycle.probe.cjs';

// Hosted normal CI runs the same actual-mounted cases as the standalone probe.
// Local verification runs only the standalone probe, never Vitest/test modules.
for (const [name, run] of probe.cases) it(name, run);
afterAll(() => probe.dispose());
