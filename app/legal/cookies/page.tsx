import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/legal/cookies' },
  title: 'Cookie Policy | ai.market',
  description: 'ai.market cookie policy describing the functional cookies and attribution cookie we use to provide and secure our services.',
};

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Cookie Policy</h1>
      <p className="text-sm text-gray-500 mb-10">Last Updated: August 14, 2026</p>

      <div className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-[#3F51B5] [&>h2]:mb-4 [&>h2]:mt-10 [&>p]:mb-6">
        <p>
          This Cookie Policy is provided by AIMARKET LLC, a Wyoming limited liability company, located at 30 N Gould St Ste R, Sheridan, WY 82801, which operates ai.market.
        </p>

        <h2>The short version</h2>
        <p>
          We use essential and functional cookies to make ai.market work, plus one first-party attribution cookie, aim_ref, which lasts 7 days and contains no identity. We do not use cookies for advertising, we do not sell or share cookie data, and we do not track you across other websites.
        </p>

        <h2>What cookies we use</h2>
        <p>
          We use strictly necessary and functional cookies, and a first-party attribution cookie. They keep you signed in through a session or refresh cookie, help protect sign-in and prevent abuse, and remember basic preferences. We do not use advertising cookies, third-party advertising cookies, or cross-site tracking cookies.
        </p>

        <table><thead><tr><th>Cookie</th><th>Purpose</th><th>Duration</th><th>Provider</th></tr></thead>
          <tbody><tr><td>aim_ref</td><td>Attributes listing inquiries to shared links; contains no identity.</td><td>7 days</td><td>First-party (ai.market)</td></tr></tbody>
        </table>

        <h2>Managing cookies</h2>
        <p>
          Your browser lets you block or delete cookies. Blocking essential and functional cookies may prevent you from signing in or using parts of the service. Blocking aim_ref prevents attribution of listing inquiries to shared links.
        </p>

        <h2>Changes</h2>
        <p>
          If our use of cookies changes, we will update this page and the date above.
        </p>

        <h2>Contact</h2>
        <p>
          If you have questions about this Cookie Policy, please contact us at{' '}
          <a href="mailto:privacy@ai.market">privacy@ai.market</a>.
        </p>
      </div>
    </div>
  );
}
