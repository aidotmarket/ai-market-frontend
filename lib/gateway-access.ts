import { getCapabilities } from '@/api/capabilities';
import { gatewayErrorCode } from '@/api/gatewayDelivery';
import { listSellerGateways } from '@/api/sellerGateways';
import type { SellerGateway } from '@/types/sellerGateway';

export type GatewayAccess =
  | { state: 'ready'; gateways: SellerGateway[] }
  | { state: 'setup'; missingSteps: string[] }
  | { state: 'unavailable' | 'error' };

export function sellerSetupSteps(error: unknown): string[] | null {
  const response = (error as { response?: { status?: number; data?: { detail?: Record<string, unknown> } } })?.response;
  const detail = response?.data?.detail;
  if (response?.status !== 403 || detail?.error !== 'capability_required' || detail.capability !== 'seller' ||
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
      return { state: 'error' };
    }
  } catch (error) {
    const missingSteps = sellerSetupSteps(error);
    return missingSteps === null ? { state: 'error' } : { state: 'setup', missingSteps };
  }
}
