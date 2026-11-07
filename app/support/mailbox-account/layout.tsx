// Nonces must be generated per request, never baked into a static page.
export const dynamic = 'force-dynamic';
export default function SupportAccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
