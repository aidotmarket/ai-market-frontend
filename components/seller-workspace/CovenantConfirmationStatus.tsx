export default function CovenantConfirmationStatus({confirmedAt}:{confirmedAt?:string|null}) {
  const date=confirmedAt ? new Date(confirmedAt) : null;
  return <p className="text-sm text-gray-700">Covenant and authority confirmed at the licence step{date&&Number.isFinite(date.getTime())&&
    <> on <time dateTime={date.toISOString()}>{date.toLocaleString()}</time></>}.</p>;
}
