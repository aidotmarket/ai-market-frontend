import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Use ai.market in Claude',
  description: 'Ask Claude to find and inspect data on ai.market in plain language.',
  alternates: {
    canonical: '/docs/claude',
  },
};

export default function ClaudeDocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
      <h1 className="text-3xl font-bold text-gray-900 mb-10">Use ai.market in Claude</h1>

      <div className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-[#3F51B5] [&>section]:mb-6">
        <section>
          <p><strong>Use ai.market in Claude.</strong> Ask Claude to find and inspect data on ai.market in plain language. Claude works with your own ai.market account and only sees what you allow.</p>
        </section>
        <section>
          <p><strong>Connect.</strong> In Claude, open Settings, then Connectors, find ai.market and choose Connect. You sign in on ai.market, see exactly what Claude is asking for, and approve. During early access your account has to be on our early-access list. Write to <a href="mailto:support@ai.market">support@ai.market</a> to join.</p>
        </section>
        <section>
          <p><strong>What Claude can do.</strong> Search published listings. Look at a listing&apos;s description, columns, row count, update frequency and price. Show your account details, your recent activity and your data requests.</p>
        </section>
        <section>
          <p><strong>What Claude cannot do.</strong> Claude cannot buy, sell, pay, publish or message anyone for you in this version. It never sees dataset files. When you want to buy, Claude gives you the link and you finish on ai.market.</p>
        </section>
        <section>
          <p><strong>Your data.</strong> We record each tool call for security, with a one-way fingerprint instead of what you asked. We do not get your Claude conversation. See the <a href="/legal/privacy#ai-assistants">privacy notice</a> for details.</p>
        </section>
        <section>
          <p><strong>Disconnect.</strong> Remove ai.market under Connectors in Claude, or revoke it under Connected apps in your ai.market account settings. Either one ends access right away.</p>
        </section>
        <section>
          <p><strong>Help.</strong> <a href="mailto:support@ai.market">support@ai.market</a> or <a href="/support">ai.market/support</a>.</p>
        </section>
      </div>
    </div>
  );
}
