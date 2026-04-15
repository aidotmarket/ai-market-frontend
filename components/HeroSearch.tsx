'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function HeroSearch() {
  const router = useRouter();
  const [value, setValue] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/search');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 max-w-xl">
      <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.02] p-2 sm:p-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
          <svg
            aria-hidden="true"
            className="shrink-0 text-gray-400 h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
            />
          </svg>
          <input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search datasets, models, and pipelines..."
            className="w-full min-w-0 bg-transparent h-12 text-base sm:text-lg text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-full bg-[#3F51B5] font-medium text-white transition-colors hover:bg-[#3545a0] px-5 py-3 text-sm sm:px-6"
        >
          Search
        </button>
      </div>
    </form>
  );
}
