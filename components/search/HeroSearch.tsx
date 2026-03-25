'use client';

import { Suspense } from 'react';
import { SearchForm } from '@/components/search/SearchForm';

export function HeroSearch() {
  return (
    <Suspense fallback={null}>
      <SearchForm
        size="hero"
        targetPath="/search"
        placeholder="Search datasets by topic, industry, or use case"
        buttonLabel="Search"
      />
    </Suspense>
  );
}
