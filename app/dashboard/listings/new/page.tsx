'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createListing } from '@/api/listings';
import { useToast } from '@/components/Toast';

export default function NewListingPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Technology',
    data_format: 'CSV',
    row_count: 1000,
    price: 10.0,
    status: 'draft',
  });

  const categories = ['Finance', 'Healthcare', 'Technology', 'Real Estate', 'Government', 'Marketing'];
  const formats = ['CSV', 'JSON', 'SQL', 'Parquet'];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'row_count' || name === 'price' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (status: 'draft' | 'published') => {
    setError('');
    
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }
    if (formData.title.length > 200) {
      setError('Title must be less than 200 characters');
      return;
    }
    if (formData.price < 1) {
      setError('Price must be at least $1');
      return;
    }

    setLoading(true);
    try {
      await createListing({ ...formData, status });
      toast(`Listing ${status === 'published' ? 'published' : 'saved as draft'} successfully`, 'success');
      router.push('/dashboard/listings');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create New Listing</h1>
        <p className="mt-1 text-sm text-gray-500">Fill out the details below to list your data for sale.</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
          {error}
        </div>
      )}

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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Global E-commerce Sales Data 2023"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  value={formData.description}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what's included in this dataset..."
                />
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
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
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
                  {formats.map((fmt) => (
                    <option key={fmt} value={fmt}>{fmt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="row_count" className="block text-sm font-medium text-gray-700 mb-1">
                  Row Count
                </label>
                <input
                  type="number"
                  id="row_count"
                  name="row_count"
                  min={1}
                  value={formData.row_count}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* Pricing */}
          <section>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Pricing</h2>
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
                  className="w-full rounded-lg border border-gray-300 pl-7 pr-12 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <span className="text-gray-500 sm:text-sm">USD</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('published')}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            {loading && (
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
