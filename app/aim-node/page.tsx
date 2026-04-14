'use client';

import Link from 'next/link';
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
      className="shrink-0 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

const sellerSteps = [
  {
    num: '1',
    title: 'Install via pip',
    desc: 'Install AIM-Node on your server with Python. It runs alongside your model or pipeline, with no uploads and no proxy layer.',
  },
  {
    num: '2',
    title: 'Wrap Model as MCP Tool',
    desc: "Expose your model or pipeline through AIM-Node's MCP interface. Define schemas, pricing, and clear descriptions for buyers and agents.",
  },
  {
    num: '3',
    title: 'Publish Metadata',
    desc: 'Register with ai.market so discovery metadata, schemas, and descriptions are searchable while your weights and code stay private.',
  },
  {
    num: '4',
    title: 'Earn per-call',
    desc: 'Buyers connect peer-to-peer to your AIM-Node. Usage is metered and settled through ai.market while you control pricing.',
  },
];

const buyerSteps = [
  {
    num: '1',
    title: 'Browse',
    desc: 'Find models and pipelines on ai.market by capability, schema, price, or quality score. AI agents can discover the same tools programmatically.',
  },
  {
    num: '2',
    title: 'Install consumer mode',
    desc: 'Run AIM-Node on your own infrastructure in consumer mode so your application has a local control point for auth and connection management.',
  },
  {
    num: '3',
    title: 'Purchase token',
    desc: 'Purchase access on ai.market and receive a cryptographically signed, time-limited delivery token scoped to that transaction.',
  },
  {
    num: '4',
    title: 'Connect P2P',
    desc: "Present the token and connect directly to the seller's AIM-Node over an encrypted peer-to-peer channel for live inference or pipeline execution.",
  },
];

const responsibilities = [
  {
    title: 'What ai.market handles',
    desc: 'Discovery, authentication, billing, delivery tokens, dispute resolution, and quality scoring. The platform coordinates the transaction and the money flow.',
  },
  {
    title: 'What ai.market never touches',
    desc: 'Model weights, training data, inference inputs, inference outputs, and raw payloads. Those stay on the endpoints and move only between nodes.',
  },
  {
    title: 'How delivery works',
    desc: "After purchase, ai.market issues a signed delivery token. The buyer's AIM-Node presents it to the seller's AIM-Node, which verifies the token and opens the encrypted channel.",
  },
  {
    title: 'Why this matters',
    desc: 'Direct delivery preserves performance, privacy, and control. Sellers keep custody of their stack, buyers get low-latency execution, and the delivery path has no central bottleneck.',
  },
];

const requirements = [
  {
    title: 'Python 3.10+ or Docker',
    desc: 'Use `pip install aim-node` for Python environments or Docker for containerized deployments.',
  },
  {
    title: '4 GB RAM minimum',
    desc: 'Enough for lightweight serving and local consumer-mode connectivity.',
  },
  {
    title: 'Network access',
    desc: 'Outbound access to the ai.market API and peer-to-peer connectivity for delivery sessions.',
  },
];

function StepIcon({ num }: { num: string }) {
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8EAF6] text-sm font-bold text-[#3F51B5]">
      {num}
    </div>
  );
}

export default function AimNodePage() {
  return (
    <div className="overflow-hidden bg-white">
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 right-0 h-[28rem] w-[28rem] rounded-full bg-[#E8EAF6] opacity-50 blur-3xl" />
          <div className="absolute top-24 -left-20 h-[20rem] w-[20rem] rounded-full bg-indigo-100 opacity-40 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-[18rem] w-[18rem] rounded-full bg-[#E8EAF6] opacity-40 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-14 pt-20 sm:px-6 sm:pb-18 sm:pt-28 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center rounded-full bg-[#E8EAF6] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#3F51B5]">
              AIM-Node
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Sell or Buy AI Models &amp; Pipelines on ai.market
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-gray-600 sm:text-xl">
              AIM-Node runs on your infrastructure and connects to ai.market&apos;s
              distributed peer-to-peer network. Sellers wrap models as MCP tools and publish.
              Buyers discover, purchase, and connect directly with no centralized proxy, no
              model uploads, and no middleman in the payload path.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="#download"
                className="inline-flex items-center justify-center rounded-lg bg-[#3F51B5] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3545a0]"
              >
                Install AIM-Node
              </a>
              <Link
                href="/listings?type=models"
                className="inline-flex items-center justify-center rounded-lg border border-[#C5CAE9] bg-white px-6 py-3 text-sm font-semibold text-[#3F51B5] transition-colors hover:border-[#3F51B5] hover:bg-[#F5F6FF]"
              >
                Browse Models
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
              For Sellers
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Publish models without giving up control
            </h2>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {sellerSteps.map((step) => (
              <div
                key={step.num}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_12px_32px_rgba(63,81,181,0.08)]"
              >
                <StepIcon num={step.num} />
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                  Step {step.num}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-4 text-sm leading-7 text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F7F8FD] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
              For Buyers
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Buy access, then connect directly
            </h2>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {buyerSteps.map((step) => (
              <div
                key={step.num}
                className="rounded-2xl border border-[#D6DBF5] bg-white p-6 shadow-[0_12px_32px_rgba(63,81,181,0.06)]"
              >
                <StepIcon num={step.num} />
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                  Step {step.num}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-4 text-sm leading-7 text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                Peer-to-Peer by Design
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                No Uploads. No Proxies. No Middleman.
              </h2>
              <div className="mt-8 space-y-5">
                {responsibilities.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-gray-200 bg-[#F9FAFF] p-5">
                    <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-gray-600">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-[#D6DBF5] bg-[#F7F8FD] p-6 sm:p-8">
              <div className="grid grid-cols-1 gap-4 text-sm text-gray-600 sm:grid-cols-3 sm:text-center">
                <div className="rounded-2xl border border-[#D6DBF5] bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                    Seller Node
                  </p>
                  <p className="mt-3 font-semibold text-gray-900">Seller&apos;s Infrastructure</p>
                  <p className="mt-2 leading-6">AIM-Node provider</p>
                  <p className="leading-6">Your model or pipeline</p>
                </div>
                <div className="rounded-2xl border border-[#D6DBF5] bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                    ai.market
                  </p>
                  <p className="mt-3 font-semibold text-gray-900">Coordination Layer</p>
                  <p className="mt-2 leading-6">Discovery + billing</p>
                  <p className="leading-6">Delivery token</p>
                </div>
                <div className="rounded-2xl border border-[#D6DBF5] bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                    Buyer Node
                  </p>
                  <p className="mt-3 font-semibold text-gray-900">Buyer&apos;s Infrastructure</p>
                  <p className="mt-2 leading-6">AIM-Node consumer</p>
                  <p className="leading-6">Your application</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-dashed border-[#A9B3E8] bg-white px-5 py-4">
                <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                      Metadata only
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                      Seller Node ↔ ai.market
                    </p>
                  </div>
                  <svg
                    className="h-5 w-20 text-[#3F51B5]"
                    fill="none"
                    viewBox="0 0 80 20"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 10h76m0 0-8-6m8 6-8 6M2 10l8-6M2 10l8 6" />
                  </svg>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                      Metadata + token
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                      ai.market ↔ Buyer Node
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl bg-[#3F51B5] px-6 py-5 text-center text-white">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-100">
                  Direct Delivery Path
                </p>
                <div className="mt-4 flex items-center justify-center gap-4">
                  <span className="text-sm font-semibold">Seller Node</span>
                  <svg
                    className="h-5 w-24 text-white"
                    fill="none"
                    viewBox="0 0 96 20"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 10h92m0 0-8-6m8 6-8 6M2 10l8-6M2 10l8 6" />
                  </svg>
                  <span className="text-sm font-semibold">Buyer Node</span>
                </div>
                <p className="mt-3 text-sm text-indigo-100">
                  Encrypted P2P channel for inference data and results
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="download" className="border-t border-gray-100 bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
              Get Started with AIM-Node
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600">
              Start with `pip` for Python-native installs or use Docker for containerized
              deployments. Full setup docs live at `get.ai.market`.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                    Recommended
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-gray-900">pip install</h3>
                </div>
                <span className="rounded-full bg-[#E8EAF6] px-3 py-1 text-xs font-semibold text-[#3F51B5]">
                  Python
                </span>
              </div>
              <div className="mt-6 flex items-center gap-3 rounded-xl bg-gray-900 px-4 py-4">
                <code className="flex-1 overflow-x-auto whitespace-nowrap text-sm text-gray-100">
                  pip install aim-node
                </code>
                <CopyButton text="pip install aim-node" />
              </div>
              <p className="mt-4 text-sm leading-7 text-gray-600">
                For Python environments on any OS. Requires Python 3.10+.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
                    Container
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-gray-900">Docker</h3>
                </div>
                <span className="rounded-full bg-[#E8EAF6] px-3 py-1 text-xs font-semibold text-[#3F51B5]">
                  OCI
                </span>
              </div>
              <div className="mt-6 space-y-3 rounded-xl bg-gray-900 px-4 py-4">
                <div className="flex items-center gap-3">
                  <code className="flex-1 overflow-x-auto whitespace-nowrap text-sm text-gray-100">
                    docker pull ghcr.io/aidotmarket/aim-node:latest
                  </code>
                  <CopyButton text="docker pull ghcr.io/aidotmarket/aim-node:latest" />
                </div>
                <div className="flex items-center gap-3">
                  <code className="flex-1 overflow-x-auto whitespace-nowrap text-sm text-gray-100">
                    docker run -p 8400:8400 -p 8401:8401 ghcr.io/aidotmarket/aim-node:latest
                  </code>
                  <CopyButton text="docker run -p 8400:8400 -p 8401:8401 ghcr.io/aidotmarket/aim-node:latest" />
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-gray-600">
                For containerized deployments. Requires Docker.
              </p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <a
              href="https://get.ai.market"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[#3F51B5] underline underline-offset-4 hover:text-[#303F9F]"
            >
              View setup guide at get.ai.market
            </a>
          </div>
        </div>
      </section>

      <section className="bg-white py-14 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#3F51B5]">
            System Requirements
          </p>
          <div className="mt-6 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            {requirements.map((item) => (
              <div key={item.title} className="rounded-2xl border border-gray-200 bg-[#F9FAFF] p-5">
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
