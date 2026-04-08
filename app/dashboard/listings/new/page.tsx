'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createDraft, enhanceListing, updateListing, getListingPreview, publishListing } from '@/api/listings';
import { getConnectStatus } from '@/api/connect';
import { useToast } from '@/components/Toast';
import { formatPrice } from '@/lib/format';
import type { SchemaColumn } from '@/types';
import { WizardAllAIBridgeProvider, useWizardBridge } from '@/components/allai/WizardAllAIBridge';
import { useAllAI } from '@/components/allai/AllAIContext';

const STEPS = [
  'Basic Info',
  'AI Enhancement',
  'Schema & Preview',
  'Pricing',
  'Compliance',
  'Review & Publish',
];

const CATEGORIES = ['Finance', 'Healthcare', 'Technology', 'Real Estate', 'Government', 'Marketing'];
const FORMATS = ['csv', 'parquet', 'json', 'xlsx', 'other'];
const CURRENCIES = ['USD', 'EUR', 'GBP'];
const COMPLIANCE_FRAMEWORKS = ['GDPR', 'HIPAA', 'CCPA', 'SOC2', 'ISO27001'];

interface WizardData {
  // Step 1: Basic Info
  title: string;
  description: string;
  data_format: string;
  row_count: number;
  column_names: string;
  column_types: string;
  // Step 2: AI Enhancement
  ai_title: string;
  ai_description: string;
  ai_tags: string[];
  ai_category: string;
  ai_suggested_price: number;
  ai_generated_fields: string[];
  // Step 3: Schema
  schema: SchemaColumn[];
  pii_score: number;
  // Step 4: Pricing
  price: number;
  pricing_type: 'one_time' | 'subscription';
  currency: string;
  // Step 5: Compliance
  compliance_frameworks: string[];
  compliance_notes: string;
}

const initialData: WizardData = {
  title: '',
  description: '',
  data_format: 'csv',
  row_count: 0,
  column_names: '',
  column_types: '',
  ai_title: '',
  ai_description: '',
  ai_tags: [],
  ai_category: 'Technology',
  ai_suggested_price: 0,
  ai_generated_fields: [],
  schema: [],
  pii_score: 0,
  price: 10,
  pricing_type: 'one_time',
  currency: 'USD',
  compliance_frameworks: [],
  compliance_notes: '',
};

export default function NewListingWizardPage() {
  return (
    <WizardAllAIBridgeProvider>
      <NewListingWizardInner />
    </WizardAllAIBridgeProvider>
  );
}

function NewListingWizardInner() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(initialData);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [stripeChecked, setStripeChecked] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);

  const bridge = useWizardBridge();
  const { setOnFieldProposal, setOnBatchProposal, setFormSnapshotGetter } = useAllAI();

  // Register form state with the bridge
  const dataRef = useRef(data);
  dataRef.current = data;

  const formGetter = useCallback(() => ({ ...dataRef.current }), []);
  const formSetter = useCallback((field: string, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  }, []);

  useEffect(() => {
    bridge?.registerFormState(formGetter, formSetter);
  }, [bridge, formGetter, formSetter]);

  // Wire SSE proposal callbacks to bridge
  useEffect(() => {
    if (!bridge) return;
    setOnFieldProposal((p) => bridge.proposeFieldChange(p.field, p.value, p.reasoning));
    setOnBatchProposal((proposals) => bridge.proposeBatchChanges(proposals));
    setFormSnapshotGetter(() => formGetter());
    return () => {
      setOnFieldProposal(null);
      setOnBatchProposal(null);
      setFormSnapshotGetter(null);
    };
  }, [bridge, setOnFieldProposal, setOnBatchProposal, setFormSnapshotGetter, formGetter]);

  useEffect(() => {
    getConnectStatus()
      .then((res) => {
        setStripeConnected(!!res.data?.details_submitted);
        setStripeChecked(true);
      })
      .catch(() => {
        setStripeConnected(false);
        setStripeChecked(true);
      });
  }, []);

  const update = (fields: Partial<WizardData>) => setData((prev) => ({ ...prev, ...fields }));

  // Step 1 → Step 2: Create draft then enhance
  const handleEnhance = async () => {
    setEnhancing(true);
    try {
      // Create draft first
      let id = draftId;
      if (!id) {
        const draftPayload: any = {
          data_format: data.data_format,
          source_row_count: data.row_count || undefined,
        };
        if (data.title.trim()) draftPayload.title = data.title.trim();
        if (data.description.trim()) draftPayload.description = data.description.trim();
        if (data.column_names.trim()) {
          const cols = data.column_names.split(',').map((c) => c.trim()).filter(Boolean);
          const types = data.column_types.split(',').map((t) => t.trim());
          const schema_info: Record<string, string> = {};
          cols.forEach((col, i) => {
            schema_info[col] = types[i] || 'string';
          });
          draftPayload.schema_info = schema_info;
        }
        const res = await createDraft(draftPayload);
        id = res.data?.id;
        if (!id) throw new Error('Failed to create draft');
        setDraftId(id);
      }

      // Enhance
      const enhanceRes = await enhanceListing(id);
      const e = enhanceRes.data;

      update({
        ai_title: e.title || data.title,
        ai_description: e.description || data.description,
        ai_tags: e.tags || [],
        ai_category: e.category || 'Technology',
        ai_suggested_price: e.suggested_price || 10,
        ai_generated_fields: e.ai_generated_fields || Object.keys(e).filter((k) => e[k]),
      });

      // Also fetch preview for schema
      try {
        const previewRes = await getListingPreview(id);
        const p = previewRes.data;
        update({
          schema: p.schema || [],
          pii_score: p.pii_score || 0,
          compliance_frameworks: p.compliance_frameworks || [],
          price: e.suggested_price || data.price,
        });
      } catch {
        // Preview may not be available yet
      }

      setStep(1);
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Enhancement failed', 'error');
    } finally {
      setEnhancing(false);
    }
  };

  // Skip AI and go to step 2 with manual data
  const handleSkipAI = async () => {
    try {
      let id = draftId;
      if (!id) {
        const draftPayload: any = {
          title: data.title.trim() || 'Untitled Listing',
          description: data.description.trim() || 'No description provided',
          data_format: data.data_format,
          source_row_count: data.row_count || undefined,
        };
        const res = await createDraft(draftPayload);
        id = res.data?.id;
        if (!id) throw new Error('Failed to create draft');
        setDraftId(id);
      }
      update({
        ai_title: data.title,
        ai_description: data.description,
        ai_tags: [],
        ai_category: 'Technology',
        ai_suggested_price: 10,
        ai_generated_fields: [],
      });
      setStep(1);
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to create draft', 'error');
    }
  };

  // Save current fields to backend
  const saveFields = async () => {
    if (!draftId) return;
    try {
      await updateListing(draftId, {
        title: data.ai_title || data.title || 'Untitled',
        description: data.ai_description || data.description || '',
        category: data.ai_category,
        tags: data.ai_tags,
        price: data.price,
        pricing_type: data.pricing_type,
        data_format: data.data_format,
        source_row_count: data.row_count || undefined,
      });
    } catch {
      // Silent save — user can still proceed
    }
  };

  const nextStep = async () => {
    await saveFields();
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const handlePublish = async () => {
    if (!draftId) return;
    setPublishing(true);
    try {
      await saveFields();
      await publishListing(draftId);
      toast('Listing published successfully!', 'success');
      router.push('/dashboard/listings');
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to publish', 'error');
    } finally {
      setPublishing(false);
      setShowConfirmModal(false);
    }
  };

  if (!stripeChecked) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent"></div>
      </div>
    );
  }

  if (!stripeConnected) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Stripe Connection Required</h2>
          <p className="text-sm text-gray-600 mb-4">You need to connect your Stripe account before creating listings.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0]"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create New Listing</h1>
        <p className="mt-1 text-sm text-gray-500">Follow the steps to list your data for sale.</p>
      </div>

      {/* Revert all AI changes */}
      {bridge && bridge.aiPopulatedFields.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-4 py-2">
          <span className="text-xs text-purple-700">
            &#10024; allAI has populated {bridge.aiPopulatedFields.size} field{bridge.aiPopulatedFields.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => bridge.revertAllAIChanges()}
            className="text-xs font-medium text-purple-600 hover:text-purple-800 underline"
          >
            Revert all AI changes
          </button>
        </div>
      )}

      {/* Progress indicator */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                    i < step
                      ? 'bg-[#3F51B5] text-white'
                      : i === step
                        ? 'bg-[#3F51B5] text-white ring-2 ring-[#C5CAE9]'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {i < step ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`mt-1 text-[10px] leading-tight text-center max-w-[60px] ${i <= step ? 'text-[#3F51B5] font-medium' : 'text-gray-400'}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-6 mx-1 mt-[-12px] ${i < step ? 'bg-[#3F51B5]' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6">
          {step === 0 && <Step1BasicInfo data={data} update={update} onEnhance={handleEnhance} onSkip={handleSkipAI} enhancing={enhancing} aiFields={bridge?.aiPopulatedFields} />}
          {step === 1 && <Step2AIEnhancement data={data} update={update} aiFields={bridge?.aiPopulatedFields} />}
          {step === 2 && <Step3Schema data={data} update={update} />}
          {step === 3 && <Step4Pricing data={data} update={update} aiFields={bridge?.aiPopulatedFields} />}
          {step === 4 && <Step5Compliance data={data} update={update} />}
          {step === 5 && <Step6Review data={data} onPublish={() => setShowConfirmModal(true)} publishing={publishing} />}
        </div>

        {/* Navigation */}
        {step > 0 && (
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
            <button
              onClick={prevStep}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Back
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={nextStep}
                className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0]"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={publishing}
                className="rounded-lg bg-[#3F51B5] px-6 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50"
              >
                Confirm & Publish
              </button>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Publish Listing?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Your listing &ldquo;{data.ai_title || data.title || 'Untitled'}&rdquo; will be visible to buyers on the marketplace.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={publishing}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] disabled:opacity-50 flex items-center"
              >
                {publishing && (
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AllAIFieldBadge() {
  return (
    <span className="ml-1 inline-flex items-center text-[10px] font-medium text-purple-600 bg-purple-50 rounded px-1.5 py-0.5">
      &#10024; allAI
    </span>
  );
}

/* ========================================================================
   Step 1: Basic Info
   ======================================================================== */

function Step1BasicInfo({
  data,
  update,
  onEnhance,
  onSkip,
  enhancing,
  aiFields,
}: {
  data: WizardData;
  update: (f: Partial<WizardData>) => void;
  onEnhance: () => void;
  onSkip: () => void;
  enhancing: boolean;
  aiFields?: Set<string>;
}) {
  if (enhancing) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900">AI is analyzing your data...</h3>
        <p className="mt-2 text-sm text-gray-500">Generating title, description, tags, pricing suggestions, and scanning for PII.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-1">Basic Information</h2>
        <p className="text-sm text-gray-500">Provide what you know — AI can fill in the rest.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional){aiFields?.has('title') && <AllAIFieldBadge />}</label>
          <input
            type="text"
            value={data.title}
            onChange={(e) => update({ title: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            placeholder="e.g., Global E-commerce Sales Data 2023"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional){aiFields?.has('description') && <AllAIFieldBadge />}</label>
          <textarea
            rows={3}
            value={data.description}
            onChange={(e) => update({ description: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            placeholder="Describe what's included in this dataset..."
          />
        </div>

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
              value={data.row_count || ''}
              onChange={(e) => update({ row_count: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
              placeholder="e.g., 50000"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Column Names (comma-separated)</label>
          <input
            type="text"
            value={data.column_names}
            onChange={(e) => update({ column_names: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            placeholder="e.g., id, name, email, purchase_amount, date"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Column Types (comma-separated, matching order above)</label>
          <input
            type="text"
            value={data.column_types}
            onChange={(e) => update({ column_types: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
            placeholder="e.g., integer, string, string, float, date"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onEnhance}
          className="rounded-lg bg-[#3F51B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#3545a0] flex items-center gap-2"
        >
          <span>&#10024;</span> Let AI Fill This In
        </button>
        <button
          onClick={onSkip}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Skip AI, fill manually
        </button>
      </div>
    </div>
  );
}

/* ========================================================================
   Step 2: AI Enhancement
   ======================================================================== */

function Step2AIEnhancement({
  data,
  update,
  aiFields,
}: {
  data: WizardData;
  update: (f: Partial<WizardData>) => void;
  aiFields?: Set<string>;
}) {
  const [tagInput, setTagInput] = useState('');
  const isAI = (field: string) => data.ai_generated_fields.includes(field);

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !data.ai_tags.includes(tag)) {
      update({ ai_tags: [...data.ai_tags, tag] });
    }
    setTagInput('');
  };

  const removeTag = (idx: number) => {
    update({ ai_tags: data.ai_tags.filter((_, i) => i !== idx) });
  };

  const AIBadge = () => (
    <span className="ml-1 inline-flex items-center text-[10px] font-medium text-purple-600 bg-purple-50 rounded px-1.5 py-0.5">
      &#10024; AI
    </span>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-1">AI Suggestions</h2>
        <p className="text-sm text-gray-500">Review and edit the AI-generated content below.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title {isAI('title') && <AIBadge />}{aiFields?.has('ai_title') && <AllAIFieldBadge />}
          </label>
          <input
            type="text"
            value={data.ai_title}
            onChange={(e) => update({ ai_title: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description {isAI('description') && <AIBadge />}{aiFields?.has('ai_description') && <AllAIFieldBadge />}
          </label>
          <textarea
            rows={4}
            value={data.ai_description}
            onChange={(e) => update({ ai_description: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags {isAI('tags') && <AIBadge />}
          </label>
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
          {data.ai_tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.ai_tags.map((tag, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-[#E8EAF6] px-3 py-1 text-xs font-medium text-[#3F51B5]">
                  {tag}
                  <button type="button" onClick={() => removeTag(idx)} className="text-blue-500 hover:text-[#3F51B5]">&times;</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category {isAI('category') && <AIBadge />}
            </label>
            <select
              value={data.ai_category}
              onChange={(e) => update({ ai_category: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5] bg-white"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Suggested Price {isAI('suggested_price') && <AIBadge />}
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-gray-500 text-sm">$</span>
              </div>
              <input
                type="number"
                min={1}
                step="0.01"
                value={data.ai_suggested_price}
                onChange={(e) => update({ ai_suggested_price: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-300 pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================
   Step 3: Schema & Preview
   ======================================================================== */

function Step3Schema({
  data,
  update,
}: {
  data: WizardData;
  update: (f: Partial<WizardData>) => void;
}) {
  const updateColumnDesc = (idx: number, desc: string) => {
    const newSchema = [...data.schema];
    newSchema[idx] = { ...newSchema[idx], description: desc };
    update({ schema: newSchema });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-1">Schema & Preview</h2>
        <p className="text-sm text-gray-500">Review the detected schema and PII scan results.</p>
      </div>

      {/* PII Score */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
          data.pii_score <= 2 ? 'bg-green-100 text-green-700' : data.pii_score <= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
        }`}>
          {data.pii_score}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">PII Scan Score</p>
          <p className="text-xs text-gray-500">
            {data.pii_score <= 2 ? 'Low risk — minimal PII detected' : data.pii_score <= 5 ? 'Medium risk — some PII fields detected' : 'High risk — significant PII detected'}
          </p>
        </div>
      </div>

      {data.schema.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Column</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                <th className="px-4 py-2 text-center text-xs font-medium uppercase text-gray-500">PII</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data.schema.map((col, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">{col.name}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{col.type}</td>
                  <td className="px-4 py-2 text-center">
                    {col.pii_flag && <span className="text-amber-500" title="PII detected">&#9888;&#65039;</span>}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={col.description}
                      onChange={(e) => updateColumnDesc(idx, e.target.value)}
                      className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#3F51B5]"
                      placeholder="Describe this column..."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-sm text-gray-500">No schema data available. Schema will be detected after data upload.</p>
        </div>
      )}
    </div>
  );
}

/* ========================================================================
   Step 4: Pricing
   ======================================================================== */

function Step4Pricing({
  data,
  update,
  aiFields,
}: {
  data: WizardData;
  update: (f: Partial<WizardData>) => void;
  aiFields?: Set<string>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-1">Pricing</h2>
        <p className="text-sm text-gray-500">Set your price and billing model.</p>
      </div>

      {data.ai_suggested_price > 0 && (
        <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 text-sm text-purple-700">
          <span>&#10024;</span> AI suggested price: <strong>{formatPrice(data.ai_suggested_price)}</strong>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Pricing Type</label>
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
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price ({data.currency}){aiFields?.has('price') && <AllAIFieldBadge />}
            </label>
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
    </div>
  );
}

/* ========================================================================
   Step 5: Compliance
   ======================================================================== */

function Step5Compliance({
  data,
  update,
}: {
  data: WizardData;
  update: (f: Partial<WizardData>) => void;
}) {
  const toggleFramework = (fw: string) => {
    const current = data.compliance_frameworks;
    if (current.includes(fw)) {
      update({ compliance_frameworks: current.filter((f) => f !== fw) });
    } else {
      update({ compliance_frameworks: [...current, fw] });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-1">Compliance</h2>
        <p className="text-sm text-gray-500">Review auto-detected compliance frameworks and add notes.</p>
      </div>

      <div className="space-y-3">
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
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Compliance Notes</label>
        <textarea
          rows={3}
          value={data.compliance_notes}
          onChange={(e) => update({ compliance_notes: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
          placeholder="Any additional compliance information..."
        />
      </div>
    </div>
  );
}

/* ========================================================================
   Step 6: Review & Publish
   ======================================================================== */

function Step6Review({
  data,
  onPublish,
  publishing,
}: {
  data: WizardData;
  onPublish: () => void;
  publishing: boolean;
}) {
  const isAI = (field: string) => data.ai_generated_fields.includes(field);
  const AIBadge = () => (
    <span className="ml-1 text-[10px] font-medium text-purple-600 bg-purple-50 rounded px-1.5 py-0.5">&#10024; AI</span>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-1">Review & Publish</h2>
        <p className="text-sm text-gray-500">Review your listing before publishing.</p>
      </div>

      {/* Preview Card */}
      <div className="rounded-lg border border-gray-200 p-5 space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">
            {data.ai_title || data.title || 'Untitled Listing'}
            {isAI('title') && <AIBadge />}
          </h3>
          <span className="inline-flex rounded-full bg-[#E8EAF6] px-2.5 py-0.5 text-xs font-medium text-[#303F9F] mt-2">
            {data.ai_category}
          </span>
        </div>

        <p className="text-sm text-gray-600">
          {data.ai_description || data.description || 'No description'}
          {isAI('description') && <AIBadge />}
        </p>

        {data.ai_tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.ai_tags.map((tag, i) => (
              <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">{tag}</span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-500">Price</p>
            <p className="text-lg font-semibold text-gray-900">{formatPrice(data.price)}</p>
            <p className="text-xs text-gray-400">{data.pricing_type === 'subscription' ? 'Subscription' : 'One-time'} &middot; {data.currency}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Data</p>
            <p className="text-sm text-gray-900">{data.data_format.toUpperCase()}{data.row_count ? ` · ${data.row_count.toLocaleString()} rows` : ''}</p>
          </div>
        </div>

        {data.schema.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Schema ({data.schema.length} columns)</p>
            <div className="flex flex-wrap gap-1.5">
              {data.schema.map((col, i) => (
                <span key={i} className={`rounded px-2 py-0.5 text-xs ${col.pii_flag ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-600'}`}>
                  {col.name}
                  {col.pii_flag && ' \u26A0\uFE0F'}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.compliance_frameworks.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Compliance</p>
            <div className="flex flex-wrap gap-1.5">
              {data.compliance_frameworks.map((fw) => (
                <span key={fw} className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">{fw}</span>
              ))}
            </div>
          </div>
        )}

        {data.pii_score > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500">PII Score: <span className={data.pii_score <= 2 ? 'text-green-600' : data.pii_score <= 5 ? 'text-yellow-600' : 'text-red-600'}>{data.pii_score}/10</span></p>
          </div>
        )}
      </div>
    </div>
  );
}
