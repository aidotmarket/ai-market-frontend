import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms and Conditions — ai.market',
  description: 'Terms and Conditions — ai.market',
  alternates: {
    canonical: '/legal/terms',
  },
};

const sectionClass = 'mt-10 space-y-4';
const headingClass = 'text-2xl font-semibold text-gray-900';
const paragraphClass = 'text-base leading-7 text-gray-700';
const listClass = 'list-disc pl-5 space-y-2 text-base leading-7 text-gray-700';

export default function TermsAndConditionsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:py-24">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">ai.market — Terms and Conditions</h1>
      <p className="text-sm text-gray-500 mb-6">Effective date: July 7, 2026 · Version 1.0</p>

      <div className="space-y-4">
        <p className={paragraphClass}>
          Operated by AIMARKET LLC, a Wyoming limited liability company, located at 30 N Gould St Ste R, Sheridan, WY 82801 (&quot;ai.market&quot;, &quot;we&quot;, &quot;us&quot;, and together with its members, managers, officers, employees, agents, affiliates, and contractors, the &quot;ai.market Parties&quot;). Governed by the laws of the State of Wyoming.
        </p>
        <p className={paragraphClass}>
          Privacy Policy:{' '}
          <a href="https://ai.market/legal/privacy" className="text-[#3F51B5] underline-offset-2 hover:underline">
            https://ai.market/legal/privacy
          </a>
        </p>
      </div>

      <section className={sectionClass}>
        <h2 className={headingClass}>The short version (read this first)</h2>
        <p className={paragraphClass}>
          This is the plain summary. It does not replace the full terms below, but it tells you what you are agreeing to.
        </p>
        <ul className={listClass}>
          <li>We are a marketplace, not a data holder. We connect buyers and sellers of data. We never touch, store, or move the actual data. We are the index and the billing layer.</li>
          <li>We are not part of your deal. The licence for the data is between the buyer and the seller. We are not a party to it and we do not guarantee any dataset.</li>
          <li>All dealing stays on ai.market. If you meet a counterparty here, you transact here. Take it off-platform within 24 months and you owe us 10 times the full transaction value.</li>
          <li>The buyer pays the transaction costs. That covers Stripe, stablecoin, and escrow fees. Our commission is 5% of the deal.</li>
          <li>Card money is held until the refund window closes. If a buyer pays by card, the seller gets paid after the refund period passes, and the payment processor holds the money in the meantime, not us.</li>
          <li>Disputes are yours to sort out. Buyers and sellers handle disputes directly. We do not mediate. We only act on a court order. We will record that a transaction ended in a dispute, and that can lower a seller&apos;s quality score.</li>
          <li>You use the market at your own risk. By agreeing, you give up the right to sue us, as far as the law allows.</li>
          <li>You sign this. You tick three boxes and add your electronic signature before you can trade.</li>
        </ul>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>1. Agreement, acceptance, and electronic contracting</h2>
        <p className={paragraphClass}>1.1 These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of the ai.market marketplace, websites, APIs, agents, and related services (together, the &quot;Platform&quot;).</p>
        <p className={paragraphClass}>1.2 The Platform is for businesses only. By accepting these Terms you confirm you are acting for a business, that the business agrees to these Terms, and that you have authority to bind it. You may not use the Platform as a consumer, for personal or household use, as a minor, or on behalf of a business you lack authority to bind.</p>
        <p className={paragraphClass}>1.3 Required acceptance steps. Before you can list, buy, or transact, you must complete all of the following. You cannot proceed without every one of them.</p>
        <p className={paragraphClass}>(a) You must tick all three boxes:</p>
        <ul className="list-none pl-0 space-y-3 text-base leading-7 text-gray-700">
          <li>☐ Box 1 — How the market works. I understand ai.market is non-custodial. It never touches, stores, or moves the data. It is not a party to any transaction, it does not mediate deals, and it does not guarantee that any dataset is accurate, lawful, or fit for purpose. The deal and its risks are between the buyer and the seller.</li>
          <li>☐ Box 2 — Staying on the platform. I understand that if I am introduced to a counterparty through ai.market and I take that transaction off the platform within 24 months, I agree to pay ai.market 10 times (10x) the entire value of that transaction as liquidated damages, and I agree this amount is a fair and reasonable estimate of the harm caused (Section 6).</li>
          <li>☐ Box 3 — At my own risk, no legal action against ai.market. I understand that disputes are strictly between the buyer and the seller, that ai.market does not mediate them, and that by using the marketplace I give up and waive all legal recourse and all right to bring any claim or legal action against the ai.market Parties, and I waive any right to a jury trial and to bring or join a class action, to the maximum extent permitted by law (Section 13).</li>
        </ul>
        <p className={paragraphClass}>(b) You must sign electronically. You must type your full legal name, your title, and the name of the business you represent, and submit them as your electronic signature. Your electronic signature has the same legal effect as a handwritten signature, confirms you have authority to bind the business, and confirms your agreement to these Terms and to the three acknowledgements above. We record the date, time, and the version of these Terms you signed.</p>
        <p className={paragraphClass}>1.4 Consent to do business electronically. You consent to contract, transact, and receive all notices, disclosures, and records electronically. You agree that your clicks, checkbox selections, typed signature, and actions taken by any automated agent you authorise are attributable to you and are legally binding. You can download and retain a copy of these Terms. This consent is given under the federal ESIGN Act and Wyoming&apos;s Uniform Electronic Transactions Act.</p>
        <p className={paragraphClass}>1.5 If you do not agree to every part, do not use the Platform.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>2. Definitions</h2>
        <p className={paragraphClass}>2.1 &quot;Seller&quot; means a business that lists data on the Platform. &quot;Buyer&quot; means a business that requests, evaluates, or acquires data through the Platform.</p>
        <p className={paragraphClass}>2.2 &quot;Listing&quot; means the metadata, description, schema information, sample structures, pricing, and licence terms a Seller publishes. A Listing describes data. It is not the data.</p>
        <p className={paragraphClass}>2.3 &quot;Data&quot; or &quot;Dataset&quot; means the actual data a Seller makes available to a Buyer. The Data never passes through ai.market.</p>
        <p className={paragraphClass}>2.4 &quot;allAI&quot; means our metadata and translation engine, which carries search, communication, and translated meaning between Buyers and Sellers. allAI is a communication, translation, logging, and metadata tool only. It does not act as ai.market&apos;s agent to negotiate, decide disputes, guarantee terms, or bind any party.</p>
        <p className={paragraphClass}>2.5 &quot;Non-custodial&quot; means we hold the index, the trust signals, and the billing metadata only. We never store, host, transmit, or take possession of the Data, and we do not hold customer funds.</p>
        <p className={paragraphClass}>2.6 &quot;Commission&quot; means the 5% fee in Section 5.</p>
        <p className={paragraphClass}>2.7 &quot;Refund Period&quot; means 90 days from the date a transaction is paid, during which a Buyer may seek a refund or a card payment may be reversed.</p>
        <p className={paragraphClass}>2.8 &quot;Payment Provider&quot; means the third-party payment processor, escrow provider, or stablecoin provider used for a transaction, including Stripe.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>3. Eligibility, accounts, and verification</h2>
        <p className={paragraphClass}>3.1 You must be a business with legal authority to contract, and the person accepting must have authority to bind it.</p>
        <p className={paragraphClass}>3.2 You confirm the information you give us is accurate and kept current. We and our Payment Providers may verify your business, including identity, business (KYB), and sanctions screening, and we may suspend or refuse access if we cannot verify you or if the information is false. Passing or failing our checks is our decision.</p>
        <p className={paragraphClass}>3.3 You are responsible for your account, your users and their roles, and any API keys or agent credentials issued to you. You are responsible for everything done under your account, whether by a person or by an automated agent you authorised. Keep credentials secure and tell us at once if they are compromised.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>4. What the Platform is, and what it is not</h2>
        <p className={paragraphClass}>4.1 ai.market connects Buyers and Sellers of data and provides discovery, listing tools, translation, quality signals, and billing.</p>
        <p className={paragraphClass}>4.2 We are non-custodial. We are the index and the billing layer. We are not a party to the licence between a Buyer and a Seller, we do not own or control the Data, we never take possession of it, and we do not hold customer funds.</p>
        <p className={paragraphClass}>4.3 We do not guarantee the Data. We do not verify that any Dataset is accurate, complete, lawful to sell, or fit for any purpose. Buyers must do their own due diligence.</p>
        <p className={paragraphClass}>4.4 Listings may be shown to and read by AI systems and agents outside our website so Buyers can find data wherever they ask. By publishing a Listing, a Seller agrees its Listing metadata can be surfaced this way.</p>
        <p className={paragraphClass}>4.5 Communication runs through allAI. Buyer-seller discovery, search, and deal communication on the Platform are carried by allAI, and Buyers and Sellers agree not to arrange an on-platform transaction through direct off-platform contact. This is how the marketplace works and how translation between languages happens. This is separate from disputes: once a transaction has gone wrong, resolving the dispute is the parties&apos; own responsibility (Section 12), and ai.market does not mediate it.</p>
      </section>

      <section id="fees" className={`${sectionClass} scroll-mt-24`}>
        <h2 className={headingClass}>5. Commission, transaction costs, payment, and tax</h2>
        <p className={paragraphClass}>5.1 Commission. We charge a 5% Commission on the value of a successful transaction. We charge no listing fees.</p>
        <p className={paragraphClass}>5.2 Buyer pays transaction costs. The Buyer pays all transaction and processing costs on top of the price, including Stripe fees, stablecoin fees, and escrow fees. These costs are the Buyer&apos;s, not the Seller&apos;s and not ours.</p>
        <p className={paragraphClass}>5.3 Card funds held by the Payment Provider until the Refund Period passes. Where a Buyer pays by credit card, the Payment Provider holds or reserves the funds and does not release them to the Seller until the Refund Period has passed. ai.market does not hold these funds; it only instructs the Payment Provider to release them once the Refund Period closes. Release is also subject to chargebacks, reversals, provider rules, sanctions review, and legal holds. This protects against reversals and chargebacks while keeping ai.market non-custodial.</p>
        <p className={paragraphClass}>5.4 Payment methods and provider terms. Payments may be made by card (via Stripe), by stablecoin, or through escrow. You agree to the terms of the applicable Payment Provider. Payment Providers may perform identity and business verification, sanctions screening, reserves, reversals, refunds, chargebacks, wallet or address checks, and tax reporting.</p>
        <p className={paragraphClass}>5.5 Tax. Prices are exclusive of taxes. Sales tax, VAT, or similar tax is calculated and collected through the Payment Provider&apos;s tax tooling (such as Stripe Tax) where it applies, and ai.market registers for and remits tax only in jurisdictions where it has a collection obligation. Because most Buyers are businesses, you agree to provide valid resale or exemption certificates and taxpayer information (such as a W-9 or W-8) when required; where you provide a valid exemption certificate, tax is not charged, and where tax is due and no exemption applies, it is added to the price. Each party is otherwise responsible for its own taxes. You acknowledge that ai.market or a Payment Provider may be required to issue a Form 1099-K or similar report.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>6. Staying on the Platform (anti-circumvention)</h2>
        <p className={paragraphClass}>6.1 If you are introduced to a counterparty through ai.market, you must transact through ai.market.</p>
        <p className={paragraphClass}>6.2 The 24-month rule and the 10x remedy. For 24 months after you are introduced to a counterparty through the Platform, you must not take that transaction, or any transaction with that counterparty arising from the introduction, off the Platform to avoid the Commission. If you do, you agree to pay ai.market liquidated damages equal to 10 times (10x) the entire value of that transaction. You agree this is a reasonable pre-estimate of our loss and not a penalty, and you acknowledged this at acceptance (Box 2).</p>
        <p className={paragraphClass}>6.3 Why this amount is reasonable. The parties agree the actual harm from off-platform circumvention is real but hard to measure at signing, and includes the lost Commission on that transaction and on the full stream of future dealings with the same counterparty, lost marketplace liquidity and network value, and the cost of detecting and enforcing against circumvention. The 10x figure reflects that harm.</p>
        <p className={paragraphClass}>6.4 Savings fallback. If a court finds the 10x amount unenforceable, the parties agree it shall be reduced to the greatest amount that is enforceable, being no less than the greater of three (3) times the avoided Commission or ai.market&apos;s actual damages plus its costs of enforcement, including legal fees.</p>
        <p className={paragraphClass}>6.5 We may translate, log, and meter interactions to run the marketplace and enforce this section.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>7. Listings and Seller obligations</h2>
        <p className={paragraphClass}>7.1 You are responsible for your Listings. You confirm you have the right to list the Data and to grant the licence you offer, and that your Listing is accurate and not misleading.</p>
        <p className={paragraphClass}>7.2 You set your own licence terms and pricing within the models the Platform supports. The licence for the Data is a contract between you and the Buyer. ai.market is not a party to it.</p>
        <p className={paragraphClass}>7.3 You are responsible for the Data itself, including its lawfulness, its quality, and any personal or sensitive information in it. You must have the rights and permissions needed to sell it.</p>
        <p className={paragraphClass}>7.4 Translations. Your original language is the canonical version of your Listing. Translations are generated by allAI and shown to you for review before publication. You are responsible for reviewing them. Low-confidence translations are flagged and are not published silently.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>8. Buyer obligations</h2>
        <p className={paragraphClass}>8.1 You are responsible for deciding whether a Dataset fits your needs. We give you metadata, quality signals, and translation to help, but the decision and the risk are yours.</p>
        <p className={paragraphClass}>8.2 You must use Data only as permitted by the licence you agree with the Seller and by these Terms, and you must comply with all laws that apply to your use of it, including data protection and privacy laws.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>9. Prohibited data and prohibited use</h2>
        <p className={paragraphClass}>9.1 You must not list, sell, request, or use Data, or use the Platform, for any of the following:</p>
        <ul className={listClass}>
          <li>Data you do not own or do not have the legal and contractual right to sell or share.</li>
          <li>Data whose sale or transfer breaks any law, regulation, contract, or third-party right, including intellectual property and privacy rights.</li>
          <li>Personal or sensitive personal data where you lack a lawful basis to sell it or to transfer it across borders, including special-category data (health, biometric, genetic, precise geolocation, racial or ethnic origin, religious or political belief, sexual orientation) unless you can lawfully do so and clearly disclose it.</li>
          <li>Data used to make decisions about individuals in ways regulated by consumer-reporting, credit, employment, insurance, or housing law, unless you are licensed and authorised for that use.</li>
          <li>Data used to unlawfully discriminate against people, including on the basis of a protected characteristic.</li>
          <li>Data that is stolen, obtained by deception, scraped in breach of a site&apos;s terms, or knowingly inaccurate or misrepresented.</li>
          <li>Child sexual abuse material, content that exploits or endangers minors, or non-consensual intimate imagery.</li>
          <li>Data that supports terrorism, violent extremism, weapons proliferation, or other serious crime.</li>
          <li>Transactions with sanctioned or restricted parties, or parties in embargoed jurisdictions, in breach of applicable sanctions and export-control law.</li>
          <li>Malware, credentials, payment-card data, or other data whose purpose is fraud, intrusion, or harm.</li>
        </ul>
        <p className={paragraphClass}>9.2 You must not impersonate anyone, misrepresent your identity or your Data, manipulate search or quality rankings, create duplicate or misleading Listings, deliver a materially different dataset than the one described, abuse the APIs or agents, or interfere with the Platform or its security and metering.</p>
        <p className={paragraphClass}>9.3 Sanctions and export compliance. You represent that you and your beneficial owners are not sanctioned or on any government restricted-party list, are not located in or a national of an embargoed jurisdiction, and are not using the Platform for a restricted end use or end user. You will comply with U.S. OFAC sanctions, U.S. export controls (including the EAR), anti-money-laundering law, and applicable export and import laws.</p>
        <p className={paragraphClass}>9.4 Reporting and takedown. Anyone may report a Listing or user that breaches this section through the contact channels we publish. We may remove a Listing, suspend an account, or end access if we determine, in our discretion, that this section is breached or that a Listing or user creates legal, regulatory, security, or reputational risk. We are under no obligation to review or monitor Listings, and we are not liable for failing to catch a problem.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>10. Intellectual property, and copyright takedown</h2>
        <p className={paragraphClass}>10.1 Sellers keep all rights in their Data. Buyers get only the licence the Seller grants for that Data. Nothing on the Platform transfers ownership of Data.</p>
        <p className={paragraphClass}>10.2 You grant ai.market a limited licence to use, display, translate, and distribute your Listing metadata so we can run the marketplace and make your Listing discoverable to humans and to AI agents, including outside our website. This licence covers metadata only. It never covers the Data.</p>
        <p className={paragraphClass}>10.3 The Platform, including our software, brand, and allAI, belongs to us. You get no rights in it beyond using the service under these Terms.</p>
        <p className={paragraphClass}>10.4 Copyright / DMCA. If you believe a Listing or metadata infringes your copyright, send a notice to our designated Copyright Agent:</p>
        <blockquote className="border-l-4 border-gray-300 bg-gray-50 p-5 text-base leading-7 text-gray-700">
          <p>Copyright Agent, AIMARKET LLC</p>
          <p>30 N Gould St Ste R, Sheridan, WY 82801</p>
          <p>Phone: (208) 948-9786</p>
          <p>
            <a href="mailto:copyright@ai.market" className="text-[#3F51B5] underline-offset-2 hover:underline">
              copyright@ai.market
            </a>
          </p>
        </blockquote>
        <p className={paragraphClass}>Your notice must include the information the DMCA requires. We will act on valid notices, provide a counter-notice process, and terminate repeat infringers. We may disable any Listing or metadata in response.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>11. Data protection and the non-custodial architecture</h2>
        <p className={paragraphClass}>11.1 Because we are non-custodial, the Data does not flow through us. The data plane moves directly between the Buyer&apos;s and Seller&apos;s systems over an encrypted relay. We handle only control-plane and billing metadata.</p>
        <p className={paragraphClass}>11.2 Sellers are responsible for any personal data in their Datasets, including having a lawful basis to sell it and honouring the rights of the people it relates to. Buyers are responsible for their own lawful use.</p>
        <p className={paragraphClass}>11.3 Neither the Buyer nor the Seller is our data processor, and we are not theirs, because we never receive the Data. Our handling of your account and billing information is governed by our Privacy Policy at https://ai.market/legal/privacy. We take commercially reasonable measures to protect the control-plane and billing metadata we do hold, and we will notify affected users of a data breach affecting it as required by law.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>12. Disputes between Buyers and Sellers</h2>
        <p className={paragraphClass}>12.1 Any dispute about a Dataset, its quality, its licence, payment, or a transaction is strictly between the Buyer and the Seller. They must first try in good faith to resolve it directly between themselves.</p>
        <p className={paragraphClass}>12.2 We do not mediate. ai.market does not mediate, arbitrate, or take sides in these disputes. We will act only where required to by a valid court order or legal process, and our involvement is limited to complying with that order.</p>
        <p className={paragraphClass}>12.3 Dispute record. We may record that a transaction resulted in a dispute. That record may be shown on the Platform and may affect a Seller&apos;s or a party&apos;s quality score. This keeps the marketplace honest for everyone.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>13. Assumption of risk, disclaimers, and waiver of legal action</h2>
        <p className={paragraphClass}>13.1 You use the Platform at your own risk. The Platform and everything on it are provided &quot;as is&quot; and &quot;as available&quot;. To the maximum extent permitted by law, we disclaim all warranties, express or implied, including any warranty that Data listed by Sellers is accurate, lawful, or fit for purpose, and any warranty that the Platform will be uninterrupted or error-free.</p>
        <p className={paragraphClass}>13.2 Waiver of claims against ai.market. To the maximum extent permitted by applicable law, and in exchange for being allowed to use the Platform, you fully and finally waive, release, and give up any and all claims, demands, causes of action, and legal recourse of any kind against the ai.market Parties arising out of or relating to the Platform, any Listing, any Data, or any transaction. You agree the deals and the Data are not ours, and the risk is entirely yours.</p>
        <p className={paragraphClass}>13.3 Covenant not to sue. You agree not to sue, and not to bring or join any lawsuit, arbitration, claim, or proceeding against the ai.market Parties in respect of any claim released under 13.2, to the maximum extent permitted by law.</p>
        <p className="text-base leading-7 text-gray-700 uppercase">13.4 NO CLASS ACTIONS, NO JURY. TO THE MAXIMUM EXTENT PERMITTED BY LAW, YOU AND AI.MARKET EACH WAIVE ANY RIGHT TO A JURY TRIAL AND ANY RIGHT TO BRING OR PARTICIPATE IN A CLASS OR REPRESENTATIVE ACTION AGAINST THE OTHER. ANY CLAIM MUST BE BROUGHT INDIVIDUALLY.</p>
        <p className={paragraphClass}>13.5 What is not waived. Nothing in this Section waives a right that cannot be waived under applicable law, and nothing in it releases ai.market&apos;s own fraud, willful misconduct, or gross negligence, or liability for death or personal injury, or a party&apos;s obligation to pay amounts owed. If any part of this Section is held unenforceable, the rest still applies to the fullest extent allowed.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>14. Limitation of liability</h2>
        <p className={paragraphClass}>14.1 To the maximum extent permitted by law, ai.market is not liable for any indirect, incidental, special, or consequential loss, or for any loss arising from Data sold by a Seller or from any transaction between users.</p>
        <p className={paragraphClass}>14.2 To the maximum extent permitted by law, our total liability to you for any matter not otherwise waived under Section 13 is capped at the greater of the Commission we actually received from you in the 12 months before the claim, or one hundred US dollars ($100). This cap does not apply to the matters carved out in 13.5.</p>
        <p className={paragraphClass}>14.3 Time limit. Any claim you bring must be filed within one (1) year after it arises, or it is permanently barred, to the extent the law allows.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>15. Indemnification</h2>
        <p className={paragraphClass}>15.1 You will defend, indemnify, and hold harmless the ai.market Parties against any claim, loss, damage, liability, and cost (including legal fees) arising from your Listings, your Data, your use of the Platform, your transactions, your breach of these Terms or of any law, or any third-party claim that your Data or Listing infringes their rights.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>16. Suspension and termination</h2>
        <p className={paragraphClass}>16.1 You can stop using the Platform at any time.</p>
        <p className={paragraphClass}>16.2 We can suspend or end your access at any time if you breach these Terms, if we are required to by law, or to protect the Platform or its users.</p>
        <p className={paragraphClass}>16.3 Sections that by their nature should survive do survive termination, including fees owed, the 24-month rule and the 10x remedy, intellectual property, disclaimers, waiver of legal action, limitation of liability, indemnity, and governing law.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>17. Changes to these Terms</h2>
        <p className={paragraphClass}>17.1 We may update these Terms. We will give at least 30 days&apos; notice of material changes. If you keep using the Platform after a change takes effect, you accept the updated Terms. We may require you to re-accept and re-sign for material changes.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>18. Governing law and venue</h2>
        <p className={paragraphClass}>18.1 These Terms are governed by the laws of the State of Wyoming, without regard to its conflict-of-laws rules.</p>
        <p className={paragraphClass}>18.2 To the extent any claim is not otherwise waived under Section 13, the state and federal courts located in Wyoming have exclusive jurisdiction, and you consent to that venue. Claims must be brought individually.</p>
      </section>

      <section className={sectionClass}>
        <h2 className={headingClass}>19. General</h2>
        <p className={paragraphClass}>19.1 Entire agreement. These Terms, plus the Privacy Policy and any licence a Seller sets for a Dataset, are the entire agreement between you and us about the Platform and replace any earlier understanding.</p>
        <p className={paragraphClass}>19.2 Severability. If any part is held unenforceable, the rest stays in force, and the unenforceable part is reduced to the extent needed to make it enforceable.</p>
        <p className={paragraphClass}>19.3 Assignment. You may not assign these Terms without our consent. We may assign them as part of a sale or reorganisation of the business.</p>
        <p className={paragraphClass}>19.4 No waiver. If we do not enforce a right, that is not a waiver of it.</p>
        <p className={paragraphClass}>19.5 Force majeure. We are not liable for delays or failures caused by events beyond our reasonable control.</p>
        <p className={paragraphClass}>19.6 Notices. We give notices through the Platform or to the contact details on your account. You send notices to us at the address above.</p>
      </section>
    </div>
  );
}
