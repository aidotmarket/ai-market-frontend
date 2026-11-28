import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createStandardSelection } from "@/api/listingLicenses";
import { EMPTY_LISTING_DRAFT, type SavedListingDraft } from "@/api/sellerListingDraft";
import type { SellerLegalIdentity } from "@/api/sellerLegalIdentity";
import { GuidedListingFlow } from "@/components/seller-workspace/GuidedListingFlow";
import SavedLicenseStep from "@/components/seller-workspace/SavedLicenseStep";
import SavedListingEditor from "@/components/seller-workspace/SavedListingEditor";
import { SellerListingDraftProvider } from "@/components/seller-workspace/SellerListingDraftStore";
import type { WorkspaceView } from "@/components/seller-workspace/WorkspaceOverview";
import { WorkspacePanel } from "@/components/seller-workspace/WorkspacePanel";
import { guidedCapabilities } from "./guidedListingFixture";

export const legalIdentity = {
  status: "known", source: "seller_typed", legal_name: "Synthetic Seller", jurisdiction: "ES", version: 2,
} satisfies SellerLegalIdentity;

export const draft = {
  draft_id: "00000000-0000-4000-8000-000000000122",
  authority_version_id: null,
  version: 3,
  updated_at: "2026-11-01T00:00:00Z",
  content: {
    ...EMPTY_LISTING_DRAFT,
    title: "Synthetic weather observations",
    description: "Daily synthetic observations for demo use.",
    description_source_version: null,
    category: "environmental-climate",
    tags: "weather",
    price: "100",
    license_selection: {
      ...createStandardSelection(),
      identity_version: legalIdentity.version,
      seller_acceptance: { signer_name: "Synthetic Signer", signer_title: "Director", authority_confirmed: true },
    },
  },
} satisfies SavedListingDraft;

const capabilities = {
  ...guidedCapabilities,
  sources: { enabled: false, status: "unavailable", reason: "disabled" },
  review: { enabled: false, status: "unavailable", reason: "disabled" },
} satisfies typeof guidedCapabilities;

function SavedListingFlow({ onListingEffects }: { onListingEffects: () => void }) {
  const [view, navigate] = useState<WorkspaceView>("license");
  useEffect(() => {
    if (view === "listing") onListingEffects();
  }, [view, onListingEffects]);

  return <SellerListingDraftProvider enabled sampleCapability={false}>
    <GuidedListingFlow capabilities={capabilities} connections={[]} view={view} navigate={navigate}>
      <WorkspacePanel active={view === "license"}><SavedLicenseStep /></WorkspacePanel>
      <WorkspacePanel active={view === "listing"} showReloadOnError>
        <SavedListingEditor active={view === "listing"} />
      </WorkspacePanel>
    </GuidedListingFlow>
  </SellerListingDraftProvider>;
}

export function mount(container: HTMLElement, onListingEffects: () => void) {
  const errors: unknown[] = [];
  const capture = (error: unknown) => { errors.push(error); };
  const renderer = createRoot(container, {
    onCaughtError: capture,
    onUncaughtError: capture,
    onRecoverableError: capture,
  });
  renderer.render(<SavedListingFlow onListingEffects={onListingEffects} />);
  return { errors, renderer };
}
