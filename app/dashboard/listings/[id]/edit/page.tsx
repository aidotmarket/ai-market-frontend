'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getListing, updateListing, unpublishListing, publishListing } from '@/api/listings';
import { useToast } from '@/components/Toast';
import SellerAtAGlance from '@/components/listings/SellerAtAGlance';
import SellerShareControls from '@/components/listings/SellerShareControls';
import SellerLicenseSelection from '@/components/seller-workspace/SellerLicenseSelection';
import {createStandardSelection,isCompleteLicenseSelection,type LicenseSelection} from '@/api/listingLicenses';
import {getSellerWorkspaceCapabilities} from '@/api/sellerWorkspace';
import { gatewayErrorCode } from '@/api/gatewayDelivery';
import { type GatewayListingSource } from '@/api/sellerGateways';
import { blockerMessage } from '@/components/gateways/presentation';
import ListingGatewaySource from '@/components/gateways/ListingGatewaySource';
import type { GatewayBlocker, GatewayFile, SellerGateway } from '@/types/sellerGateway';
import Link from 'next/link';

const CATEGORIES = ['Finance', 'Healthcare', 'Technology', 'Real Estate', 'Government', 'Marketing'];
const FORMATS = ['csv', 'parquet', 'json', 'xlsx', 'other'];
const CURRENCIES = ['USD', 'EUR', 'GBP'];
const COMPLIANCE_FRAMEWORKS = ['GDPR', 'HIPAA', 'CCPA', 'SOC2', 'ISO27001'];

interface EditData {
  title: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  pricing_type: 'one_time' | 'subscription';
  currency: string;
  data_format: string;
  source_row_count: number;
  compliance_frameworks: string[];
  compliance_notes: string;
  status: string;
}

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [listingSlug, setListingSlug] = useState<string | undefined>();
  const [data, setData] = useState<EditData>({
    title: '',
    description: '',
    category: 'Technology',
    tags: [],
    price: 10,
    pricing_type: 'one_time',
    currency: 'USD',
    data_format: 'csv',
    source_row_count: 0,
    compliance_frameworks: [],
    compliance_notes: '',
    status: 'draft',
  });
  const [tagInput, setTagInput] = useState('');
  const [listingLicensesEnabled, setListingLicensesEnabled] = useState(false);
  const [licenseSelection, setLicenseSelection] = useState<LicenseSelection>(createStandardSelection());
  const [initialSource, setInitialSource] = useState<GatewayListingSource | null>(null);
  const [chosenGateway, setChosenGateway] = useState<SellerGateway | null>(null);
  const [sourceFiles, setSourceFiles] = useState<GatewayFile[]>([]);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishBlockers, setPublishBlockers] = useState<GatewayBlocker[]>([]);
  const onGatewayChosen = useCallback((gateway: SellerGateway | null) => setChosenGateway(gateway), []);
  const onSourceSaved = useCallback((gateway: SellerGateway, files: GatewayFile[]) => {
    setChosenGateway(gateway); setSourceFiles(files); setPublishError(null); setPublishBlockers([]);
  }, []);

  const fetchListing = useCallback(async () => {
    try {
      const [res, capabilities] = await Promise.all([getListing(id), getSellerWorkspaceCapabilities().catch(() => null)]);
      const l = res as any;
      const licensesEnabled = capabilities?.listing_licenses === true;
      setListingLicensesEnabled(licensesEnabled);
      if (licensesEnabled && l.license_selection) setLicenseSelection(l.license_selection);
      setListingSlug(typeof l.slug === 'string' ? l.slug : undefined);
      if (l.source?.type === 'gateway') setInitialSource(l.source);
      setData({
        title: l.title || '',
        description: l.description || '',
        category: l.category || 'Technology',
        tags: l.tags || [],
        price: l.pricing?.price ?? l.price ?? 10,
        pricing_type: l.pricing?.pricing_type ?? l.pricing_type ?? 'one_time',
        currency: 'USD',
        data_format: l.data_format || 'csv',
        source_row_count: l.source_row_count ?? l.row_count ?? 0,
        compliance_frameworks: l.compliance_frameworks || [],
        compliance_notes: l.compliance_notes || '',
        status: l.status || 'draft',
      });
    } catch {
      toast('Failed to load listing', 'error');
      router.push('/dashboard/listings');
    } finally {
      setLoading(false);
    }
  }, [id, router, toast]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  const update = (fields: Partial<EditData>) => setData((prev) => ({ ...prev, ...fields }));

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !data.tags.includes(tag)) {
      update({ tags: [...data.tags, tag] });
    }
    setTagInput('');
  };

  const removeTag = (idx: number) => {
    update({ tags: data.tags.filter((_, i) => i !== idx) });
  };

  const toggleFramework = (fw: string) => {
    if (data.compliance_frameworks.includes(fw)) {
      update({ compliance_frameworks: data.compliance_frameworks.filter((f) => f !== fw) });
    } else {
      update({ compliance_frameworks: [...data.compliance_frameworks, fw] });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateListing(id, {
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags,
        price: data.price,
        pricing_type: data.pricing_type,
        data_format: data.data_format,
        source_row_count: data.source_row_count,
        compliance_frameworks: data.compliance_frameworks,
        compliance_notes: data.compliance_notes,
      });
      setSummaryRevision(value => value + 1);
      toast('Listing saved', 'success');
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    setSaving(true);
    try {
      await unpublishListing(id);
      toast('Listing unpublished', 'success');
      setData((prev) => ({ ...prev, status: 'unlisted' }));
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to unpublish', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    setPublishError(null); setPublishBlockers([]);
    try {
      if (listingLicensesEnabled) await publishListing(id, licenseSelection);
      else await publishListing(id);
      toast('Listing published', 'success');
      setData((prev) => ({ ...prev, status: 'published' }));
    } catch (err: any) {
      const code = gatewayErrorCode(err);
      if (code === 'gateway_not_publishable') {
        const blockers = err.response?.data?.error?.details?.blockers;
        setPublishError('This gateway listing cannot be published yet. Resolve these issues and try again.');
        setPublishBlockers(Array.isArray(blockers) ? blockers : []);
      } else if (code === 'gateway_offline') setPublishError('The gateway is offline. Reconnect it before publishing.');
      else if (code === 'listing_not_draft') setPublishError('Only a draft listing can be published. Refresh this listing.');
      else toast(err.response?.data?.detail || 'Failed to publish', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Listing</h1>
          <p className="mt-1 text-sm text-gray-500">Update your listing details.</p>
        </div>
        <button
          onClick={() => router.push('/dashboard/listings')}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Listings
        </button>
      </div>

      {data.status === 'published' && (
        <SellerShareControls listingId={id} />
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        {/* Title & Description */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => update({ title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={4}
              value={data.description}
              onChange={(e) => update({ description: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={data.category}
              onChange={(e) => update({ category: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] bg-white"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                placeholder="Add a tag"
              />
              <button onClick={addTag} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Add
              </button>
            </div>
            {data.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.tags.map((tag, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-[#E8EAF6] px-3 py-1 text-xs font-medium text-[#3F51B5]">
                    {tag}
                    <button type="button" onClick={() => removeTag(idx)} className="text-blue-500 hover:text-[#3F51B5]">&times;</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Data Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
            <select
              value={data.data_format}
              onChange={(e) => update({ data_format: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] bg-white"
            >
              {FORMATS.map((fmt) => (
                <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Row Count</label>
            <input
              type="number"
              min={0}
              value={data.source_row_count}
              onChange={(e) => update({ source_row_count: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            />
          </div>
        </div>

        {/* Pricing */}
        <div className="space-y-4 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">Pricing</h3>
          <div className="flex gap-4">
            {(['one_time', 'subscription'] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pricing_type"
                  value={type}
                  checked={data.pricing_type === type}
                  onChange={() => update({ pricing_type: type })}
                  className="h-4 w-4 text-[#3F51B5] border-gray-300 focus:ring-[#3F51B5]"
                />
                <span className="text-sm text-gray-700">
                  {type === 'one_time' ? 'One-time purchase' : 'Subscription'}
                </span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price ({data.currency})</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="text-gray-500 text-sm">$</span>
                </div>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={data.price}
                  onChange={(e) => update({ price: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={data.currency}
                onChange={(e) => update({ currency: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] bg-white"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Compliance */}
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">Compliance</h3>
          {COMPLIANCE_FRAMEWORKS.map((fw) => {
            const active = data.compliance_frameworks.includes(fw);
            return (
              <label
                key={fw}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  active ? 'border-[#C5CAE9] bg-[#E8EAF6]' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleFramework(fw)}
                    className="h-4 w-4 rounded border-gray-300 text-[#3F51B5] focus:ring-[#3F51B5]"
                  />
                  <span className="text-sm font-medium text-gray-900">{fw}</span>
                </div>
                {active && (
                  <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    Compliant
                  </span>
                )}
              </label>
            );
          })}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Compliance Notes</label>
            <textarea
              rows={2}
              value={data.compliance_notes}
              onChange={(e) => update({ compliance_notes: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
              placeholder="Any additional compliance information..."
            />
          </div>
        </div>
      </div>

      {listingLicensesEnabled && <SellerLicenseSelection value={licenseSelection} onChange={setLicenseSelection} disabled={saving} />}

      {data.status === 'draft' && <ListingGatewaySource listingId={id} initialSource={initialSource} onGatewayChosen={onGatewayChosen} onSourceSaved={onSourceSaved} />}

      <SellerAtAGlance listingId={id} slug={listingSlug} active={!saving} revision={summaryRevision} />

      {/* Actions */}
      {publishError && <div role="alert" className="rounded border border-red-300 p-3 text-red-700"><p>{publishError}</p>{publishBlockers.length > 0 && <ul className="list-disc pl-6">{publishBlockers.map((blocker, index) => <li key={`${blocker.code}-${blocker.file_id ?? index}`}>{blockerMessage(blocker, sourceFiles)}</li>)}</ul>}</div>}
      {(data.status === 'draft' || data.status === 'unlisted') && chosenGateway && !chosenGateway.identity_ack_at && <p className="rounded border border-amber-300 p-3 text-sm">Before this listing goes live: after purchase, buyers learn your door hostname and certificate. Use a neutral hostname. <Link href={`/dashboard/gateways/${encodeURIComponent(chosenGateway.gateway_id)}`} className="text-indigo-700 underline">Review and acknowledge the gateway identity notice</Link>.</p>}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-4">
        <div className="text-sm text-gray-500">
          Status: <span className="font-medium text-gray-900 capitalize">{data.status.replace('_', ' ')}</span>
        </div>
        <div className="flex items-center gap-3">
          {data.status === 'published' && (
            <button
              onClick={handleUnpublish}
              disabled={saving}
              className="rounded-lg border border-yellow-300 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-50 disabled:opacity-50"
            >
              Unpublish
            </button>
          )}
          {(data.status === 'draft' || data.status === 'unlisted') && (
            <button
              onClick={handlePublish}
              disabled={saving || (listingLicensesEnabled && !isCompleteLicenseSelection(licenseSelection))}
              className="rounded-lg border border-yellow-300 px-4 py-2 text-sm font-medium text-yellow-700 hover:bg-yellow-50 disabled:opacity-50"
            >
              Publish
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}
