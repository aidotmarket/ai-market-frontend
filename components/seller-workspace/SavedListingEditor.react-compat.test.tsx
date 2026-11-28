// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createStandardSelection } from "@/api/listingLicenses";
import { EMPTY_LISTING_DRAFT, type SavedListingDraft } from "@/api/sellerListingDraft";
import { guidedCapabilities } from "@/tests/guidedListingFixture";
import { GuidedListingFlow } from "./GuidedListingFlow";
import SavedLicenseStep from "./SavedLicenseStep";
import SavedListingEditor from "./SavedListingEditor";
import { resetSellerListingDraftOwnerForTests, SellerListingDraftProvider } from "./SellerListingDraftStore";
import type { WorkspaceView } from "./WorkspaceOverview";

vi.mock("react", async importOriginal => {
  const react = await importOriginal<typeof import("react")>();
  // Model the Next browser runtime's missing export as an undefined import.
  return { ...react, default: { ...react, useEffectEvent: undefined }, useEffectEvent: undefined };
});

const api = vi.hoisted(() => ({
  readDraft: vi.fn(),
  saveDraft: vi.fn(),
  acceptPolish: vi.fn(),
  saveIdentity: vi.fn(),
}));
vi.mock("@/api/sellerListingDraft", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/sellerListingDraft")>(),
  readListingDraft: api.readDraft,
  saveListingDraft: api.saveDraft,
}));
vi.mock("@/api/listingPolish", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/listingPolish")>(),
  acceptPolish: api.acceptPolish,
}));
vi.mock("@/api/capabilities", () => ({ getCapabilities: async () => ({}) }));
vi.mock("@/api/sellerLegalIdentity", async importOriginal => ({
  ...await importOriginal<typeof import("@/api/sellerLegalIdentity")>(),
  refreshSellerLegalIdentity: async () => {},
  getSellerLegalIdentity: async () => ({
    status: "known", source: "seller_typed", legal_name: "Synthetic Seller", jurisdiction: "ES", version: 2,
  }),
  saveSellerLegalIdentity: api.saveIdentity,
}));

const capabilities = {
  ...guidedCapabilities,
  sources: { enabled: false, status: "unavailable", reason: "disabled" },
  review: { enabled: false, status: "unavailable", reason: "disabled" },
} satisfies typeof guidedCapabilities;

function SavedListingFlow() {
  const [view, navigate] = useState<WorkspaceView>("license");
  return <SellerListingDraftProvider enabled sampleCapability={false}>
    <GuidedListingFlow capabilities={capabilities} connections={[]} view={view} navigate={navigate}>
      {view === "license" ? <SavedLicenseStep /> : <SavedListingEditor active />}
    </GuidedListingFlow>
  </SellerListingDraftProvider>;
}

afterEach(() => {
  cleanup();
  resetSellerListingDraftOwnerForTests();
  vi.unstubAllEnvs();
});

it("opens Describe and price from a saved licence without useEffectEvent or writes", async () => {
  vi.stubEnv("NEXT_PUBLIC_LISTING_REVIEW_ENABLED", "false");
  api.readDraft.mockResolvedValue({
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
        identity_version: 2,
        seller_acceptance: { signer_name: "Synthetic Signer", signer_title: "Director", authority_confirmed: true },
      },
    },
  } satisfies SavedListingDraft);

  render(<SavedListingFlow />);
  const next = await screen.findByRole("button", { name: "Next: Describe and price →" });
  await waitFor(() => expect(next).toHaveProperty("disabled", false));
  expect(screen.getByText("Licence choice saved to your account.")).toBeTruthy();
  expect(screen.queryByLabelText("Title")).toBeNull();
  fireEvent.click(next);

  expect(await screen.findByLabelText("Title")).toHaveProperty("value", "Synthetic weather observations");
  expect(screen.getByLabelText("Your price (USD)")).toHaveProperty("value", "100");
  expect(api.readDraft).toHaveBeenCalledOnce();
  expect(api.saveDraft).not.toHaveBeenCalled();
  expect(api.saveIdentity).not.toHaveBeenCalled();
  expect(api.acceptPolish).not.toHaveBeenCalled();
});
