import { permanentRedirect } from 'next/navigation';

export default function SiteTermsPage() {
  permanentRedirect('/legal/terms');
}
