'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { acceptTerms, type TermsPartyContext } from '@/api/legal';
import { useAuthStore } from '@/store/auth';

const ACK_BOX_1 = 'I understand ai.market is non-custodial. It never touches, stores, or moves the data. It is not a party to any transaction, it does not mediate deals, and it does not guarantee that any dataset is accurate, lawful, or fit for purpose. The deal and its risks are between the buyer and the seller.';
const ACK_BOX_2 = 'I understand that if I am introduced to a counterparty through ai.market and I take that transaction off the platform within 24 months, I agree to pay ai.market 10 times (10x) the entire value of that transaction as liquidated damages, and I agree this amount is a fair and reasonable estimate of the harm caused.';
const ACK_BOX_3 = 'I understand that disputes are strictly between the buyer and the seller, that ai.market does not mediate them, and that by using the marketplace I give up and waive all legal recourse and all right to bring any claim or legal action against the ai.market Parties, and I waive any right to a jury trial and to bring or join a class action, to the maximum extent permitted by law.';

interface TermsAcceptanceFormProps {
  context: TermsPartyContext;
  compact?: boolean;
  onAccepted?: () => void;
}

export default function TermsAcceptanceForm({ context, compact = false, onAccepted }: TermsAcceptanceFormProps) {
  const user = useAuthStore((s) => s.user);
  const [signerFullName, setSignerFullName] = useState(fullName(user?.first_name, user?.last_name));
  const [signerTitle, setSignerTitle] = useState('');
  const [businessLegalName, setBusinessLegalName] = useState(user?.company_name || '');
  const [authorityAck, setAuthorityAck] = useState(false);
  const [ackBox1, setAckBox1] = useState(false);
  const [ackBox2, setAckBox2] = useState(false);
  const [ackBox3, setAckBox3] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(() => (
    ackBox1 &&
    ackBox2 &&
    ackBox3 &&
    signerFullName.trim().length > 0 &&
    signerTitle.trim().length > 0 &&
    businessLegalName.trim().length > 0 &&
    (context.scope !== 'organization' || authorityAck)
  ), [ackBox1, ackBox2, ackBox3, authorityAck, businessLegalName, context.scope, signerFullName, signerTitle]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      await acceptTerms({
        ...context,
        signer_full_name: signerFullName.trim(),
        signer_title: signerTitle.trim(),
        business_legal_name: businessLegalName.trim(),
        authority_ack: context.scope === 'organization' ? authorityAck : false,
        ack_box1: ackBox1,
        ack_box2: ackBox2,
        ack_box3: ackBox3,
      });
      setSubmitted(true);
      onAccepted?.();
    } catch (err) {
      if (err instanceof AxiosError) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : 'Could not record acceptance. Please try again.');
      } else {
        setError('Could not record acceptance. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-800">
        Terms accepted. You can continue using ai.market.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? 'space-y-5' : 'space-y-6'}>
      <div className="rounded-lg border border-[#C5CAE9] bg-[#E8EAF6] px-4 py-3 text-sm text-[#303F9F]">
        Review the full terms before signing.{' '}
        <Link href="/legal/terms" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
          Open Terms and Conditions
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-900">Required acknowledgements</legend>
        <RequiredCheckbox id="ack-box-1" checked={ackBox1} onChange={setAckBox1} label={ACK_BOX_1} />
        <RequiredCheckbox id="ack-box-2" checked={ackBox2} onChange={setAckBox2} label={ACK_BOX_2} />
        <RequiredCheckbox id="ack-box-3" checked={ackBox3} onChange={setAckBox3} label={ACK_BOX_3} />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField id="signer-full-name" label="Full legal name" value={signerFullName} onChange={setSignerFullName} />
        <TextField id="signer-title" label="Title" value={signerTitle} onChange={setSignerTitle} />
        <TextField id="business-legal-name" label="Business legal name" value={businessLegalName} onChange={setBusinessLegalName} />
      </div>

      {context.scope === 'organization' && (
        <RequiredCheckbox
          id="authority-ack"
          checked={authorityAck}
          onChange={setAuthorityAck}
          label="I am authorized to bind this business"
        />
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="inline-flex w-full items-center justify-center rounded-lg bg-[#3F51B5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3545a0] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {submitting ? 'Recording acceptance...' : 'Accept and sign'}
      </button>
    </form>
  );
}

function RequiredCheckbox({
  id,
  checked,
  onChange,
  label,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-700">
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#3F51B5] focus:ring-[#3F51B5]"
      />
      <span>{label}</span>
    </label>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label} <span className="text-red-500">*</span>
      </label>
      <input
        id={id}
        type="text"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
      />
    </div>
  );
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(' ');
}
