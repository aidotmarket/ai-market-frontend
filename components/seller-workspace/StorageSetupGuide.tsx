'use client';

import { useEffect, useRef, useState } from 'react';

export type StorageProvider = 'aws' | 'r2';
const steps = ['Your account', 'Create storage', 'Add your files', 'Connect to ai.market'];
const guides = {
  aws: {
    name: 'AWS S3', console: 'https://console.aws.amazon.com/s3/',
    start: 'https://aws.amazon.com/',
    docs: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html',
    pricing: 'https://aws.amazon.com/s3/pricing/',
    account: 'Create an AWS account, or sign in to the account your business will use. Complete the account and billing steps with AWS, then open S3.',
    bucket: 'In S3, create a general purpose bucket. Give it a unique name and choose a region suitable for your business. Keep Block Public Access enabled and ACLs disabled. Leave encryption enabled.',
    upload: 'Open your bucket and create a folder for the data you want to sell. Upload your files into that folder and wait for the upload to finish. Note the bucket name, region and folder for the connection step.',
    ready: 'Use the AWS connection form to identify your bucket and folder, then follow its authorization instructions in your own AWS account. The connection check happens separately.',
  },
  r2: {
    name: 'Cloudflare R2', console: 'https://dash.cloudflare.com/',
    start: 'https://dash.cloudflare.com/',
    docs: 'https://developers.cloudflare.com/r2/get-started/',
    pricing: 'https://developers.cloudflare.com/r2/pricing/',
    account: 'Create a Cloudflare account, or sign in to your business account. Open Storage & databases, then R2 and Overview. Complete the R2 subscription checkout in Cloudflare.',
    bucket: 'In R2, create a bucket: a named place to keep your files. Choose a name using lowercase letters, numbers and hyphens. Keep the bucket private; you do not need a public website address for your data.',
    upload: 'Open your bucket and upload the files you want to sell. Wait for the upload to finish and check that the files appear. Keep the bucket name handy. For large uploads, use the options in Cloudflare’s upload guide.',
    ready: 'Your files can stay in your Cloudflare account. The R2 connection to ai.market is still being completed. Preparing storage here does not connect it or publish any data.',
  },
};
const button = 'rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50';

export function StorageSetupGuide({ provider, canConnectAWS, onConnectAWS, onClose }: {
  provider: StorageProvider; canConnectAWS: boolean; onConnectAWS: () => void; onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const guide = guides[provider];
  useEffect(() => { heading.current?.focus(); }, [step]);
  return (
    <section className="mt-5 rounded-xl border border-indigo-200 bg-white p-5 sm:p-6" aria-label={`${guide.name} setup guide`}>
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Guided storage setup</p><h3 className="mt-2 text-xl font-semibold text-gray-900">Get started with {guide.name}</h3></div>
        <button type="button" className={button} onClick={onClose}>Close guide</button>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">You own the account and the files. Follow along here while you set up storage in another tab. Your cloud provider bills you directly for its services.</p>
      <a href={guide.pricing} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-indigo-700 underline">Review {guide.name} pricing (new tab)</a>
      <ol className="my-5 grid gap-2 sm:grid-cols-4" aria-label="Storage setup steps">{steps.map((label, index) => <li key={label}><button type="button" onClick={() => setStep(index)} aria-current={step === index ? 'step' : undefined} className={`w-full rounded-lg p-3 text-left text-sm ${step === index ? 'bg-indigo-50 font-semibold text-indigo-900' : 'bg-gray-50 text-gray-600'}`}>{index + 1}. {label}</button></li>)}</ol>
      <h4 ref={heading} tabIndex={-1} className="text-lg font-semibold text-gray-900">{steps[step]}</h4>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-700">{[guide.account, guide.bucket, guide.upload, guide.ready][step]}</p>
      {step === 0 && <button type="button" onClick={() => setStep(3)} className="mt-3 text-sm font-medium text-indigo-700 underline">I already have storage and files</button>}
      {step < 3 && <div className="mt-4 flex flex-wrap gap-4">
        <a href={step === 0 ? guide.start : guide.console} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-indigo-700 underline">Open {guide.name === 'AWS S3' ? 'AWS' : 'Cloudflare'} (new tab)</a>
        <a href={provider === 'r2' && step === 2 ? 'https://developers.cloudflare.com/r2/objects/upload-objects/' : provider === 'r2' && step === 1 ? 'https://developers.cloudflare.com/r2/buckets/create-buckets/' : guide.docs} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-700 underline">Provider’s step-by-step instructions (new tab)</a>
      </div>}
      {step === 3 && provider === 'aws' && <><button type="button" disabled={!canConnectAWS} onClick={onConnectAWS} className={`mt-4 ${button}`}>Continue to AWS connection</button>{!canConnectAWS && <p className="mt-2 text-sm text-gray-600">AWS connection setup is currently unavailable in this Workspace. Your storage remains in your AWS account.</p>}</>}
      <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className={button}>Back</button>{step < 3 && <button type="button" onClick={() => setStep(step + 1)} className={button}>Continue guide</button>}</div>
      <p className="mt-4 text-xs text-gray-500">These steps are guidance, not a check of your cloud account. Keep passwords and secret keys in your provider account. Guide progress lasts while this page is open.</p>
    </section>
  );
}
