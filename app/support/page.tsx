import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact & Support | ai.market',
  description: 'Get help with ai.market. Reach us by email or through allAI on the site.',
};

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Contact &amp; Support</h1>
      <p className="text-lg text-gray-600 mb-12">
        We&apos;re here to help. There are two ways to reach us.
      </p>

      <div className="space-y-10">
        {/* Email */}
        <div className="rounded-xl border border-gray-200 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-50 p-3 shrink-0">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 6L2 7" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Email Us</h2>
              <p className="text-gray-600 mb-4">
                For general inquiries, partnership requests, data listing questions, or any other support needs, email us directly.
              </p>
              <a
                href="mailto:support@ai.market"
                className="inline-flex items-center gap-2 text-blue-600 font-medium hover:text-blue-700 transition-colors"
              >
                support@ai.market
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* allAI */}
        <div className="rounded-xl border border-gray-200 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-purple-50 p-3 shrink-0">
              <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Chat with allAI</h2>
              <p className="text-gray-600 mb-4">
                allAI is our AI assistant built into the site. It can answer questions about datasets, help you navigate the marketplace, and send feedback or support requests to our team on your behalf.
              </p>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">How to use allAI for support:</h3>
              <ol className="text-gray-600 space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="font-semibold text-gray-800 shrink-0">1.</span>
                  <span>Click the <strong>chat icon</strong> in the bottom-right corner of any page on ai.market.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-gray-800 shrink-0">2.</span>
                  <span>Type your question or describe the issue you&apos;re experiencing. You can ask about listings, pricing, data formats, account issues, or anything else.</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-semibold text-gray-800 shrink-0">3.</span>
                  <span>If allAI can&apos;t resolve your issue directly, just say <strong>&ldquo;I&apos;d like to send feedback&rdquo;</strong> or <strong>&ldquo;Please send this to the team&rdquo;</strong> and allAI will forward your message to our support team.</span>
                </li>
              </ol>
            </div>
          </div>
        </div>

        {/* Response time */}
        <div className="bg-gray-50 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-600">
            We typically respond to emails within 24 hours on business days. allAI is available 24/7 for instant help.
          </p>
        </div>
      </div>
    </div>
  );
}
