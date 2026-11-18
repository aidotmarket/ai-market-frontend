import { getCapabilities } from '@/api/capabilities';
import { gatewayErrorCode } from '@/api/gatewayDelivery';
import { listSellerGateways } from '@/api/sellerGateways';
import type { SellerGateway } from '@/types/sellerGateway';

export type GatewayAccess =
  | { state: 'ready'; gateways: SellerGateway[] }
  | { state: 'setup'; missingSteps: string[] }
  | { state: 'unavailable' | 'error' };

export function sellerSetupSteps(error: unknown): string[] | null {
  const detail = (error as { response?: { data?: { detail?: Record<string, unknown> } } })?.response?.data?.detail;
  if (detail?.error !== 'capability_required' || detail.capability !== 'seller' ||
      detail.effective_status === 'active' || !Array.isArray(detail.missing_steps)) return null;
  return detail.missing_steps.filter((step): step is string => typeof step === 'string');
}

export async function loadGatewayAccess(): Promise<GatewayAccess> {
  try {
    const { seller } = await getCapabilities();
    try {
      // Probe even during setup so the platform switch takes precedence.
      const gateways = await listSellerGateways();
      return seller.effective_status === 'active'
        ? { state: 'ready', gateways }
        : { state: 'setup', missingSteps: seller.missing_steps ?? [] };
    } catch (error) {
      if (gatewayErrorCode(error) === 'gateway_disabled') return { state: 'unavailable' };
      const missingSteps = sellerSetupSteps(error);
      if (missingSteps !== null) return { state: 'setup', missingSteps };
      if (seller.effective_status !== 'active') return { state: 'setup', missingSteps: seller.missing_steps ?? [] };
      return { state: 'error' };
    }
  } catch (error) {
    const missingSteps = sellerSetupSteps(error);
    return missingSteps === null ? { state: 'error' } : { state: 'setup', missingSteps };
  }
}
