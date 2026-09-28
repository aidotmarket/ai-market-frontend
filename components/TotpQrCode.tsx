'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Props = {
  uri: string;
  className: string;
};

export default function TotpQrCode({ uri, className }: Props) {
  const [qr, setQr] = useState<{ uri: string; dataUrl: string } | null>(null);

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(uri, { width: 200, errorCorrectionLevel: 'M' })
      .then((dataUrl) => {
        if (active) setQr({ uri, dataUrl });
      })
      .catch(() => {
        if (active) setQr(null);
      });

    return () => { active = false; };
  }, [uri]);

  if (!qr || qr.uri !== uri) return null;

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={qr.dataUrl} alt="QR code for two-factor authentication setup" className={className} />;
}
