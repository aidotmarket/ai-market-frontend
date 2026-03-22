import { PublishWizardContainer } from '@/components/publish-wizard/PublishWizardContainer';

export default async function PublishWizardPage({
  params,
}: {
  params: Promise<{ operationId: string }>;
}) {
  const { operationId } = await params;
  return <PublishWizardContainer operationId={operationId} />;
}
