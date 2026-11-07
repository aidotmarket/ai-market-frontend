import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
  test: { environment: 'jsdom', globals: true, maxWorkers: 1,
    setupFiles: ['./tests/support-network-trap.ts'],
    include: ['app/dashboard/orders/*/page*.test.tsx', 'api/support.test.ts', 'lib/order-issue-report.test.ts', 'components/allai/OrderIssueReport.test.tsx', 'components/allai/SupportMode.test.tsx',
      'components/allai/AllAIContext.test.tsx', 'api/session-mutation.test.ts', 'components/allai/TicketStatusCard.test.tsx', 'components/allai/AllAIPanel.test.tsx', 'components/allai/AllAIMessage.test.tsx'] },
});
