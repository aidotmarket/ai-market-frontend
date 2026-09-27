import { SELLER_COUNTRIES } from '@/api/sellerLegalIdentityCountries';

type CountrySelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (code: string) => void;
};

export default function CountrySelect({ value, onChange, ...props }: CountrySelectProps) {
  return (
    <select {...props} value={value.toUpperCase()} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose a country</option>
      {SELLER_COUNTRIES.map(({ code, name }) => (
        <option key={code} value={code}>{name} ({code})</option>
      ))}
    </select>
  );
}
