// Backend 45555868: OAuth status reports only connector enabled; authority
// enabled means standing authority, not rollout. Neither proves seller switches.
// Keep entry points dark until a separately reviewed server reporting contract
// is available. Never infer rollout from NEXT_PUBLIC flags, grants or authority.
export interface SellerSwitchReport { seller: boolean; effects: boolean; bulk: boolean }
export function useSellerSwitches(): SellerSwitchReport | null { return null; }
