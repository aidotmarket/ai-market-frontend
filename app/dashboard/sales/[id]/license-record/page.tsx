import LicenseRecordView from '@/components/LicenseRecordView';
import { parseSalesFilter } from '../../filters';

export default async function SellerLicenseRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const filter = parseSalesFilter((await searchParams).status);
  return <LicenseRecordView party="seller" backHref={filter ? `/dashboard/sales?status=${filter}` : '/dashboard/sales'} />;
}
