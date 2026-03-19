'use client';

import type { Metadata } from 'next';
import { useState } from 'react';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function DownloadPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 right-0 h-[28rem] w-[28rem] rounded-full bg-blue-100 opacity-40 blur-3xl" />
          <div className="absolute top-20 -left-20 h-[20rem] w-[20rem] rounded-full bg-indigo-100 opacity-30 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-16 sm:pt-32 sm:pb-24">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-wide text-blue-600 uppercase">
              Local-First Data Processing
            </p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              Get{' '}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                vectorAIz
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl">
              Process, enrich, and profile your data locally with AI. Your data never leaves your
              infrastructure — only metadata is shared when you choose to publish.
            </p>
          </div>
        </div>
      </section>

      {/* Install Cards */}
      <section className="pb-20 sm:pb-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Marketplace — Primary */}
            <div className="relative rounded-xl border-2 border-blue-600 p-8">
              <span className="absolute -top-3 left-6 bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white rounded-full">
                Recommended
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0 0 20.25 9.35m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">For Data Sellers</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Pre-configured for ai.market. Process your data and publish listings directly to the
                marketplace.
              </p>
              <div className="mt-6 flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3">
                <code className="flex-1 text-sm text-gray-100 overflow-x-auto whitespace-nowrap">
                  curl -fsSL https://get.vectoraiz.com/market | bash
                </code>
                <CopyButton text="curl -fsSL https://get.vectoraiz.com/market | bash" />
              </div>
            </div>

            {/* Standard — Secondary */}
            <div className="rounded-xl border border-gray-200 p-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 0 1-1.59.659H9.06a2.25 2.25 0 0 1-1.591-.659L5 14.5m14 0-1.543-4.117A2.25 2.25 0 0 0 15.349 8.75H8.651a2.25 2.25 0 0 0-2.108 1.633L5 14.5" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">For Data Processing</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Process and enrich data locally. Connect to a marketplace later, or use standalone.
              </p>
              <div className="mt-6 flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3">
                <code className="flex-1 text-sm text-gray-100 overflow-x-auto whitespace-nowrap">
                  curl -fsSL https://get.vectoraiz.com | bash
                </code>
                <CopyButton text="curl -fsSL https://get.vectoraiz.com | bash" />
              </div>
            </div>
          </div>

          {/* Windows Note */}
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">Windows users</p>
                <p className="mt-1 text-sm text-amber-700">
                  Install{' '}
                  <a href="https://learn.microsoft.com/en-us/windows/wsl/install" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900">
                    WSL2
                  </a>
                  {' '}and{' '}
                  <a href="https://docs.docker.com/desktop/install/windows-install/" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-900">
                    Docker Desktop for Windows
                  </a>
                  {' '}first, then run the install commands above inside your WSL terminal.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="border-t border-gray-100 bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-sm font-semibold tracking-wide text-blue-600 uppercase">Requirements</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">Docker Desktop</p>
                <p className="text-sm text-gray-500">Required for running vectorAIz containers</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">Mac, Linux, or Windows</p>
                <p className="text-sm text-gray-500">macOS 12+, any modern Linux, or Windows 10/11 with WSL2</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
