'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createListing, updateListing } from '@/api/listings';
import { getConnectStatus } from '@/api/connect';
import { useToast } from '@/components/Toast';

const CATEGORIES = ['Finance', 'Healthcare', 'Technology', 'Real Estate', 'Government', 'Marketing'];
const FORMATS = ['csv', 'parquet', 'json', 'xlsx', 'other'];
const LICENSES = ['CC-BY-4.0', 'MIT', 'Custom', 'Apache-2.0'];

interface FormErrors {
  title?: string;
  description?: string;
  short_description?: string;
  price?: string;
  tags?: string;
  pricing_type?: string;
}

export default function NewListingPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [stripeChecked, setStripeChecked] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    short_description: '',
    category: 'Technology',
    tags: [] as string[],
    data_format: 'csv',
    source_row_count: 1000,
    schema_info: {} as Record<string, string>,
    license: 'CC-BY-4.0',
    price: 10.0,
    pricing_type: 'one_time' as 'one_time' | 'subscription' | 'both',
  });

  const [tagInput, setTagInput] = useState('');

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'source_row_count' || name === 'price' ? Number(value) : value,
    }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (formData.tags.length >= 10) {
      setErrors((prev) => ({ ...prev, tags: 'Maximum 10 tags allowed' }));
      return;
    }
    if (!formData.tags.includes(tag)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput('');
    setErrors((prev) => ({ ...prev, tags: undefined }));
  };

  const removeTag = (idx: number) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((_, i) => i !== idx) }));
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    const title = formData.title.trim();
    const description = formData.description.trim();
    const shortDesc = formData.short_description.trim();

    if (!title) {
      newErrors.title = 'Title is required';
    } else if (title.length > 200) {
      newErrors.title = 'Title must be 200 characters or less';
    }

    if (!description) {
      newErrors.description = 'Description is required';
    } else if (description.length > 5000) {
      newErrors.description = 'Description must be 5000 characters or less';
    }

    if (shortDesc.length > 300) {
      newErrors.short_description = 'Short description must be 300 characters or less';
    }

    if (formData.tags.length > 10) {
      newErrors.tags = 'Maximum 10 tags allowed';
    }

    if (formData.price < 1) {
      newErrors.price = 'Price must be at least $1';
    }

    if (!formData.pricing_type) {
      newErrors.pricing_type = 'Pricing type is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const trimmedPayload = () => ({
    title: formData.title.trim(),
    description: formData.description.trim(),
    short_description: formData.short_description.trim() || undefined,
    category: formData.category,
    tags: formData.tags,
    data_format: formData.data_format,
    source_row_count: formData.source_row_count,
    schema_info: Object.keys(formData.schema_info).length > 0 ? formData.schema_info : undefined,
    license: formData.license,
    price: formData.price,
    pricing_type: formData.pricing_type,
  });

  const handleSaveDraft = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await createListing(trimmedPayload());
      toast('Listing saved as draft', 'success');
      router.push('/dashboard/listings');
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to save draft', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!validate()) return;
    setPublishing(true);
    try {
      // Step 1: Create as draft
      const createRes = await createListing(trimmedPayload());
      const listingId = createRes.data?.id;
      if (!listingId) {
        throw new Error('Failed to create listing');
      }

      try {
        // Step 2: Publish via PATCH
        await updateListing(listingId, { status: 'published' });
        toast('Listing published successfully', 'success');
        router.push('/dashboard/listings');
      } catch {
        // Draft saved but publish failed
        toast('Draft saved, but publishing failed. You can publish from the listings page.', 'error');
        router.push('/dashboard/listings');
      }
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to create listing', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const isSubmitting = saving || publishing;

  if (!stripeChecked) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
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
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create New Listing</h1>
        <p className="mt-1 text-sm text-gray-500">Fill out the details below to list your data for sale.</p>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-6 space-y-8">
          {/* Basics */}
          <section>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Basics</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  maxLength={200}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.title ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="e.g., Global E-commerce Sales Data 2023"
                />
                <div className="flex justify-between mt-1">
                  {errors.title ? <p className="text-xs text-red-600">{errors.title}</p> : <span />}
                  <p className="text-xs text-gray-400">{formData.title.length}/200</p>
                </div>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  value={formData.description}
                  onChange={handleChange}
                  maxLength={5000}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.description ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="Describe what's included in this dataset..."
                />
                <div className="flex justify-between mt-1">
                  {errors.description ? <p className="text-xs text-red-600">{errors.description}</p> : <span />}
                  <p className="text-xs text-gray-400">{formData.description.length}/5000</p>
                </div>
              </div>

              <div>
                <label htmlFor="short_description" className="block text-sm font-medium text-gray-700 mb-1">
                  Short Description
                </label>
                <input
                  type="text"
                  id="short_description"
                  name="short_description"
                  value={formData.short_description}
                  onChange={handleChange}
                  maxLength={300}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.short_description ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="Brief one-liner for search results"
                />
                <div className="flex justify-between mt-1">
                  {errors.short_description ? <p className="text-xs text-red-600">{errors.short_description}</p> : <span />}
                  <p className="text-xs text-gray-400">{formData.short_description.length}/300</p>
                </div>
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags {formData.tags.length > 0 && <span className="text-gray-400 font-normal">({formData.tags.length}/10)</span>}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add a tag and press Enter"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    disabled={formData.tags.length >= 10}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                {errors.tags && <p className="text-xs text-red-600 mt-1">{errors.tags}</p>}
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {tag}
                        <button type="button" onClick={() => removeTag(idx)} className="text-blue-500 hover:text-blue-700">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* Data Details */}
          <section>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Data Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="data_format" className="block text-sm font-medium text-gray-700 mb-1">
                  Format
                </label>
                <select
                  id="data_format"
                  name="data_format"
                  value={formData.data_format}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {FORMATS.map((fmt) => (
                    <option key={fmt} value={fmt}>{fmt.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="source_row_count" className="block text-sm font-medium text-gray-700 mb-1">
                  Row Count
                </label>
                <input
                  type="number"
                  id="source_row_count"
                  name="source_row_count"
                  min={1}
                  value={formData.source_row_count}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="col-span-2">
                <label htmlFor="license" className="block text-sm font-medium text-gray-700 mb-1">
                  License
                </label>
                <select
                  id="license"
                  name="license"
                  value={formData.license}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {LICENSES.map((lic) => (
                    <option key={lic} value={lic}>{lic}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* Pricing */}
          <section>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Pricing</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pricing Type <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  {(['one_time', 'subscription', 'both'] as const).map((type) => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="pricing_type"
                        value={type}
                        checked={formData.pricing_type === type}
                        onChange={handleChange}
                        className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        {type === 'one_time' ? 'One-time' : type === 'subscription' ? 'Subscription' : 'Both'}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.pricing_type && <p className="text-xs text-red-600 mt-1">{errors.pricing_type}</p>}
              </div>

              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                  Price (USD) <span className="text-red-500">*</span>
                </label>
                <div className="relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-gray-500 sm:text-sm">$</span>
                  </div>
                  <input
                    type="number"
                    name="price"
                    id="price"
                    min={1}
                    step="0.01"
                    value={formData.price}
                    onChange={handleChange}
                    className={`w-full rounded-lg border pl-7 pr-12 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.price ? 'border-red-300' : 'border-gray-300'}`}
                    placeholder="0.00"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <span className="text-gray-500 sm:text-sm">USD</span>
                  </div>
                </div>
                {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price}</p>}
              </div>
            </div>
          </section>
        </div>

        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSubmitting}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center"
          >
            {saving && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            Save as Draft
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            {publishing && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            Publish Listing
          </button>
        </div>
      </div>
    </div>
  );
}
