'use client';

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

const steps = [
  {
    num: '1',
    title: 'Install AIM Channel',
    desc: 'Download and run the installer. AIM Channel runs locally via Docker - nothing is sent anywhere.',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
  {
    num: '2',
    title: 'Prepare with allAI',
    desc: 'allAI, your local AI assistant, profiles your data, detects PII, scores quality, and generates listing metadata - all on your machine.',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
      </svg>
    ),
  },
  {
    num: '3',
    title: 'Publish Your Listing',
    desc: 'Review what allAI prepared and publish to ai.market with one click. Only metadata and descriptions are shared - raw data stays with you.',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
      </svg>
    ),
  },
  {
    num: '4',
    title: 'Deliver Securely',
    desc: 'When a buyer purchases, ai.market generates a secure, time-limited token. Data flows peer-to-peer from your AIM Channel instance - no middleman.',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
];

const features = [
  {
    title: 'Local-First Processing',
    desc: 'Your data never leaves your infrastructure. All profiling, PII detection, and quality scoring happens on your machine.',
  },
  {
    title: 'AI-Assisted Listings',
    desc: 'allAI helps describe your data, generate metadata, and optimize your listing for discovery by buyers and AI agents.',
  },
  {
    title: 'Automated PII Detection',
    desc: 'Sensitive data is flagged before publishing. Protect your customers and stay compliant automatically.',
  },
  {
    title: 'Quality Scoring',
    desc: 'Every dataset is scored for completeness, consistency, and freshness so buyers know what they are getting.',
  },
  {
    title: 'Peer-to-Peer Delivery',
    desc: 'No middleman. Buyers connect directly to your AIM Channel instance through secure, time-limited access tokens.',
  },
  {
    title: '5% Marketplace Fee',
    desc: 'Utility pricing. We make money when you make money. No listing fees, no hidden charges.',
  },
];

export default function AimChannelDownloadPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 right-0 h-[28rem] w-[28rem] rounded-full bg-[#E1F5EE] opacity-40 blur-3xl" />
          <div className="absolute top-20 -left-20 h-[20rem] w-[20rem] rounded-full bg-teal-100 opacity-30 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-12 sm:pt-32 sm:pb-16">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
              Manage &amp; List Data with{' '}
              <span className="bg-gradient-to-r from-[#0F6E56] to-[#0c5a47] bg-clip-text text-transparent">
                AIM Channel
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
              AIM Channel processes your data locally, generates AI-enriched metadata, and publishes
              listings to ai.market. Your raw data never leaves your servers.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="pb-16 sm:pb-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-sm font-semibold tracking-wide text-[#0F6E56] uppercase mb-10">
            How it works
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 max-w-5xl mx-auto">
            {steps.map((step) => (
              <div key={step.num} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E1F5EE] text-[#0F6E56] mb-4">
                  {step.icon}
                </div>
                <div className="text-xs font-semibold text-[#0F6E56] uppercase tracking-wide mb-1">
                  Step {step.num}
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm leading-6 text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download Section */}
      <section className="py-16 sm:py-24 bg-gray-50 border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Install AIM Channel
            </h2>
            <p className="mt-3 text-base text-gray-600">
              One command. Runs locally in Docker. Free to use.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 max-w-4xl mx-auto">
            {/* Mac & Linux */}
            <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-8">
              <div className="flex items-center gap-3 mb-1">
                <svg className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">Mac &amp; Linux</h3>
              </div>
              <p className="flex-1 text-sm text-gray-500 mb-5">macOS (Apple Silicon &amp; Intel) and any modern Linux distribution</p>
              <div className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 mb-4">
                <code className="flex-1 text-sm text-gray-100 overflow-x-auto whitespace-nowrap">
                  curl -fsSL https://get.ai.market/aim-channel | bash
                </code>
                <CopyButton text="curl -fsSL https://get.ai.market/aim-channel | bash" />
              </div>
              <p className="text-xs text-gray-500">
                Requires{' '}
                <a href="https://docs.docker.com/desktop/" target="_blank" rel="noopener noreferrer" className="text-[#0F6E56] hover:text-[#0c5a47] underline">
                  Docker Desktop
                </a>
                {' '}or{' '}
                <a href="https://orbstack.dev/" target="_blank" rel="noopener noreferrer" className="text-[#0F6E56] hover:text-[#0c5a47] underline">
                  OrbStack
                </a>
              </p>
            </div>

            {/* Windows */}
            <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-8">
              <div className="flex items-center gap-3 mb-1">
                <svg className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
                <h3 className="text-lg font-semibold text-gray-900">Windows</h3>
              </div>
              <p className="flex-1 text-sm text-gray-500 mb-5">Windows 10 and 11 with PowerShell</p>
              <div className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 mb-4">
                <code className="flex-1 text-sm text-gray-100 overflow-x-auto whitespace-nowrap">
                  irm https://get.ai.market/aim-channel/windows | iex
                </code>
                <CopyButton text="irm https://get.ai.market/aim-channel/windows | iex" />
              </div>
              <p className="text-xs text-gray-500">
                Requires{' '}
                <a href="https://docs.docker.com/desktop/install/windows-install/" target="_blank" rel="noopener noreferrer" className="text-[#0F6E56] hover:text-[#0c5a47] underline">
                  Docker Desktop for Windows
                </a>
                {' '}and{' '}
                <a href="https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-windows" target="_blank" rel="noopener noreferrer" className="text-[#0F6E56] hover:text-[#0c5a47] underline">
                  PowerShell 5.1+
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-sm font-semibold tracking-wide text-[#0F6E56] uppercase mb-10">
            What you get
          </h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {features.map((feature) => (
              <div key={feature.title}>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm leading-6 text-gray-600">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="border-t border-gray-100 bg-gray-50 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-sm font-semibold tracking-wide text-[#0F6E56] uppercase">System requirements</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-3xl">
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-[#0F6E56]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">Docker</p>
                <p className="text-sm text-gray-500">Docker Desktop, OrbStack, or Docker Engine</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-[#0F6E56]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">8 GB RAM</p>
                <p className="text-sm text-gray-500">16 GB recommended</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 h-5 w-5 shrink-0 text-[#0F6E56]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">10 GB Disk</p>
                <p className="text-sm text-gray-500">For Docker images and data</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
