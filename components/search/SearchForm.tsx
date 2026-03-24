'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type SearchFormSize = 'hero' | 'compact';

interface SearchFormProps {
  placeholder?: string;
  size?: SearchFormSize;
  targetPath?: string;
  className?: string;
  buttonLabel?: string;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function SearchForm({
  placeholder = 'Search datasets by topic, industry, or use case',
  size = 'compact',
  targetPath,
  className,
  buttonLabel = 'Search',
}: SearchFormProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') || '');

  useEffect(() => {
    setValue(searchParams.get('q') || '');
  }, [searchParams]);

  const isHero = size === 'hero';

  function resolveTargetPath() {
    if (targetPath) return targetPath;
    if (pathname === '/listings' || pathname === '/search') return pathname;
    return '/search';
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextPath = resolveTargetPath();
    const nextParams = new URLSearchParams(
      pathname === nextPath ? searchParams.toString() : ''
    );
    const trimmed = value.trim();

    if (trimmed) {
      nextParams.set('q', trimmed);
    } else {
      nextParams.delete('q');
    }

    nextParams.delete('page');
    nextParams.delete('per_page');
    nextParams.delete('offset');

    router.push(`${nextPath}${nextParams.toString() ? `?${nextParams.toString()}` : ''}`);
  }

  return (
    <form onSubmit={handleSubmit} className={cn('w-full', className)}>
      <label className="sr-only" htmlFor={`search-input-${size}`}>
        Search datasets
      </label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border border-gray-200 bg-white shadow-sm ring-1 ring-black/[0.02]',
          isHero ? 'p-2 sm:p-3' : 'p-1.5'
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3">
          <svg
            aria-hidden="true"
            className={cn('shrink-0 text-gray-400', isHero ? 'h-5 w-5' : 'h-4 w-4')}
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
            id={`search-input-${size}`}
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            className={cn(
              'w-full min-w-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none',
              isHero ? 'h-12 text-base sm:text-lg' : 'h-8 text-sm'
            )}
          />
        </div>

        <button
          type="submit"
          className={cn(
            'shrink-0 rounded-full bg-blue-600 font-medium text-white transition-colors hover:bg-blue-700',
            isHero ? 'px-5 py-3 text-sm sm:px-6' : 'px-3 py-2 text-xs sm:px-4 sm:text-sm'
          )}
        >
          {buttonLabel}
        </button>
      </div>
    </form>
  );
}
