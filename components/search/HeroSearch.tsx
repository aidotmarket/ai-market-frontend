'use client';

import { SearchForm } from '@/components/search/SearchForm';

export function HeroSearch() {
  return (
    <SearchForm
      size="hero"
      targetPath="/search"
      placeholder="Search datasets by topic, industry, or use case"
      buttonLabel="Search"
    />
  );
}
