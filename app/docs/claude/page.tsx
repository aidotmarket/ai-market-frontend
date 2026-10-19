import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Use ai.market in Claude',
  description: 'Use ai.market from Claude in plain language.',
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
          <p><strong>Use ai.market in Claude.</strong> Use ai.market from Claude in plain language. Buyers can find and inspect data. Sellers can manage their listings. Claude works with your own ai.market account and only does what you approve.</p>
        </section>
        <section>
          <p><strong>Connect.</strong> In Claude, open Settings, then Connectors, find ai.market and choose Connect. You sign in on ai.market, see exactly what Claude is asking for, and approve. If you sell for a company, choose the company account on that screen.</p>
        </section>
        <section>
          <p><strong>What Claude can do.</strong> For buyers. Search published listings. Look at a listing&apos;s description, columns, row count, update frequency and price. Show your account, your recent activity and your data requests. For sellers. Show your listings and drafts. Create a new draft or update one. Add a better description and other details to a listing draft. Tell you what is still missing before a listing can go live. Update several listings at once. Publish a listing that is ready, or take one down. To publish or take down several listings at once, ai.market usually sends you a link to confirm on the website first. If you have already approved this kind of change in your ai.market settings, it goes ahead without the link. Read and answer buyer questions and data requests through ai.market. Show your orders and mark an order as delivered. Some actions take effect straight away, like replying to a buyer or marking an order delivered, so be clear about what you ask Claude to do.</p>
        </section>
        <section>
          <p><strong>What Claude cannot do.</strong> Claude cannot buy or pay for you in this version. Some steps, like accepting the licence terms for a listing, happen on the ai.market website. Claude cannot upload sample files. Use the website for those. Claude never sees your dataset files, and buyers and sellers never get each other&apos;s contact details.</p>
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
