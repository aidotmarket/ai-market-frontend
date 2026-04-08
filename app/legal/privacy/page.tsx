import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Notice | ai.market',
  description: 'ai.market privacy notice describing how we collect, use, and protect your personal information.',
};

export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">ai.market Privacy Notice</h1>
      <p className="text-sm text-gray-500 mb-10">Last Updated: March 25, 2026</p>

      <div className="prose prose-gray max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-[#3F51B5]">
        <p>
          ai.market and its affiliates (&ldquo;ai.market,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) are committed to protecting your privacy. This Privacy Notice describes how we collect, use, disclose, and otherwise process personal information in connection with our websites, applications, and other online services that link to this Privacy Notice (collectively, the &ldquo;Services&rdquo;), as well as offline activities such as events and sales interactions.
        </p>

        <h2>Information We Collect</h2>
        <p>
          We collect personal information in a variety of ways. We collect information you provide directly to us, such as when you create an account, fill out a form, make a purchase, submit a data listing, communicate with us via third-party social media sites, request customer support, or otherwise communicate with us. The types of information we may collect include your name, email address, company name, job title, postal address, phone number, payment information, and any other information you choose to provide.
        </p>
        <p>
          We automatically collect certain information when you access or use the Services, including your IP address, browser type and operating system, referring URLs, information about your usage of the Services such as pages viewed and features used, device identifiers, and information collected through cookies, pixel tags, and similar technologies. We may also receive information about you from other sources, including third-party services and organizations, and combine this information with other personal information we have about you.
        </p>

        <h2>How We Use Your Information</h2>
        <p>
          We use the personal information we collect to provide, maintain, and improve the Services, to process transactions and send you related information, to send you technical notices, updates, security alerts, and support messages, and to respond to your comments, questions, and customer service requests. We also use your information to communicate with you about products, services, and events offered by ai.market and others, and to provide news, information, and content we think will be of interest to you.
        </p>
        <p>
          We may use your information to monitor and analyze trends, usage, and activities in connection with the Services, to detect, investigate, and prevent fraudulent transactions and other illegal activities, to protect the rights and property of ai.market and others, and to personalize and improve the Services and provide content and features that match your profile or interests.
        </p>

        <h2>How We Share Your Information</h2>
        <p>
          We may share personal information with vendors, consultants, and other service providers who need access to such information to carry out work on our behalf. We may share information in response to a request for information if we believe disclosure is in accordance with, or required by, any applicable law, regulation, or legal process. We may share information if we believe your actions are inconsistent with our user agreements or policies, if we believe you have violated the law, or if we believe it is necessary to protect the rights, property, and safety of ai.market, our users, the public, or others.
        </p>
        <p>
          We may share information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business by another company. We may share information between and among ai.market and our current and future parents, affiliates, subsidiaries, and other companies under common control and ownership. We may also share aggregated or de-identified information that cannot reasonably be used to identify you.
        </p>

        <h2>Data Retention</h2>
        <p>
          We retain personal information for as long as necessary to fulfill the purposes for which it was collected, including to satisfy any legal, accounting, or reporting requirements. To determine the appropriate retention period for personal information, we consider the amount, nature, and sensitivity of the personal information, the potential risk of harm from unauthorized use or disclosure, the purposes for which we process the information, whether we can achieve those purposes through other means, and applicable legal requirements.
        </p>

        <h2>Security</h2>
        <p>
          ai.market takes reasonable measures to help protect personal information from loss, theft, misuse, unauthorized access, disclosure, alteration, and destruction. However, no method of transmission over the Internet, or method of electronic storage, is fully secure. We cannot guarantee the absolute security of your personal information.
        </p>

        <h2>International Data Transfers</h2>
        <p>
          ai.market is based in the United States and we process and store information in the United States and other countries. If you are located outside the United States, your personal information may be transferred to, stored, and processed in the United States or other countries where our service providers operate. These countries may have data protection laws that are different from the laws of your country. We take steps to ensure that your personal information receives an adequate level of protection in the jurisdictions in which we process it.
        </p>

        <h2>Your Rights and Choices</h2>
        <p>
          Depending on your location, you may have certain rights with respect to your personal information, including the right to access, correct, delete, or port your personal information, and the right to opt out of certain processing activities. You may update your account information at any time by logging into your account. You may opt out of receiving promotional communications from ai.market by following the instructions in those messages. If you opt out, we may still send you non-promotional communications, such as those about your account or our ongoing business relations.
        </p>

        <h2>Cookies and Tracking Technologies</h2>
        <p>
          We use cookies and similar tracking technologies to collect and use personal information about you, including to serve interest-based advertising. You can control cookies through your browser settings and other tools. For more information about the cookies we use, please see our Cookie Policy.
        </p>

        <h2>Changes to This Privacy Notice</h2>
        <p>
          We may update this Privacy Notice from time to time. If we make material changes, we will notify you by revising the date at the top of the notice and, in some cases, we may provide you with additional notice such as adding a statement to our homepage or sending you a notification. We encourage you to review this Privacy Notice whenever you access the Services to stay informed about our information practices and the choices available to you.
        </p>

        <h2>Contact Us</h2>
        <p>
          If you have any questions about this Privacy Notice or our privacy practices, please contact us at{' '}
          <a href="mailto:privacy@ai.market">privacy@ai.market</a>.
        </p>
      </div>
    </div>
  );
}
