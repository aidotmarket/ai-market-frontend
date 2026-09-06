import DataVerificationPaymentMethod from '@/components/DataVerificationPaymentMethod';

export default async function DataVerificationPaymentMethodReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <DataVerificationPaymentMethod
      mode="return"
      initialSetupAttemptId={typeof query.attempt === 'string' ? query.attempt : null}
      initialCheckoutSessionId={typeof query.session_id === 'string' ? query.session_id : null}
    />
  );
}
