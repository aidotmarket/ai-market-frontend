import type {Cell, Descriptor, Json, LogicalType} from './types';
import {canonical, closed, codepointCompare, natural, requirePreview as check, unicode} from './primitives';

type Params = Record<string, Json>;
const tags = ['boolean', 'signed_integer', 'decimal', 'string', 'date', 'timestamp', 'array', 'object'];
const nfc = (v: unknown): string => {check(typeof v === 'string', 'invalid_unicode'); return unicode(v).normalize('NFC');};
function objectFields(params: Params): Descriptor[] {
  check(Array.isArray(params.object_fields), 'invalid_schema');
  return params.object_fields.map(f => {closed(f, 'name type nullable type_parameters'); return [f.name, f.type, f.nullable, f.type_parameters] as Descriptor;});
}
export function schemaDescriptors(raw: unknown): Descriptor[] {
  let nodes = 0;
  function type(tag: unknown, params: unknown, depth: number): Params {
    check(++nodes <= 10000 && depth <= 16, 'schema_bound');
    check(typeof tag === 'string' && tags.includes(tag), 'unsupported_logical_type');
    check(params !== null && typeof params === 'object' && !Array.isArray(params), 'invalid_schema');
    const p = params as Params;
    if (tag === 'decimal') {closed(p, 'precision scale'); check(natural(p.precision, 1) && p.precision <= 1000 && natural(p.scale) && p.scale <= p.precision, 'invalid_decimal_parameters');}
    else if (tag === 'timestamp') {closed(p, 'timestamp_precision'); check(natural(p.timestamp_precision) && p.timestamp_precision <= 9, 'invalid_timestamp_parameters');}
    else if (tag === 'array') {
      closed(p, 'element_type'); closed(p.element_type, 'type type_parameters');
      return {element_type: {type: p.element_type.type as string, type_parameters: type(p.element_type.type, p.element_type.type_parameters, depth + 1)}};
    } else if (tag === 'object') {
      closed(p, 'object_fields'); return {object_fields: fields(objectFields(p), depth + 1).map(f => ({name: f[0], type: f[1], nullable: f[2], type_parameters: f[3]}))};
    } else closed(p, '');
    return p;
  }
  function fields(input: unknown, depth: number): Descriptor[] {
    check(Array.isArray(input) && input.length > 0 && input.length <= 500, 'field_limit');
    const names = new Set<string>();
    return input.map(f => {
      check(Array.isArray(f) && f.length === 4, 'invalid_schema'); const name = nfc(f[0]);
      check(Array.from(name).length > 0 && Array.from(name).length <= 255 && !names.has(name), 'duplicate_field'); names.add(name);
      check(typeof f[2] === 'boolean', 'invalid_schema');
      return [name, f[1], f[2], type(f[1], f[3], depth)] as Descriptor;
    }).sort((a, b) => codepointCompare(a[0], b[0]));
  }
  return fields(raw, 0);
}
function validDate(value: string): boolean {
  return /^\d{4}-\d\d-\d\d$/.test(value) && value.slice(0, 4) !== '0000' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function normalizeTimestamp(value: unknown, precision: number): string {
  check(typeof value === 'string', 'invalid_timestamp');
  const match = /^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  check(match && validDate(match[1]), 'invalid_timestamp');
  const [, day, clock, frac = '', zone] = match;
  check(/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(clock) && (zone === 'Z' || /^[+-]([01]\d|2[0-3]):[0-5]\d$/.test(zone)), 'invalid_timestamp');
  check(frac.replace(/0+$/, '').length <= precision, 'timestamp_precision_loss');
  const time = new Date(`${day}T${clock}${zone}`); check(Number.isFinite(time.getTime()), 'invalid_timestamp');
  const utc = time.toISOString().slice(0, 19); check(utc.length === 19 && utc.slice(0, 4) !== '0000', 'invalid_timestamp');
  return utc + (precision ? '.' + frac.slice(0, precision).padEnd(precision, '0') : '') + 'Z';
}
export function normalizeDecimal(value: unknown, precision: number, scale: number): string {
  if (typeof value === 'number') {check(Number.isSafeInteger(value), 'unsafe_integer'); value = String(value);}
  check(typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value), 'invalid_decimal');
  const negative = value.startsWith('-'), [whole, frac = ''] = value.replace(/^-/, '').split('.');
  const integral = whole.replace(/^0+/, ''), zero = !/[1-9]/.test(value);
  check(frac.length <= scale && (zero ? 0 : integral.length) <= precision - scale, 'decimal_out_of_range');
  const fraction = frac.replace(/0+$/, '');
  return (negative && !zero ? '-' : '') + (integral || '0') + (fraction ? '.' + fraction : '');
}
export function canonicalRow(record: unknown, descriptors: Descriptor[], budget = {nodes: 0}): {text: string; cells: Record<string, Cell>} {
  function tick(depth: number) {check(++budget.nodes <= 10000 && depth <= 16, 'row_bound');}
  function fields(raw: unknown, schema: Descriptor[], depth: number): [string, Cell['kind'], Json][] {
    check(raw !== null && typeof raw === 'object' && !Array.isArray(raw), 'invalid_record');
    const normalized = new Map<string, unknown>();
    for (const [key, value] of Object.entries(raw)) {const name = nfc(key); check(!normalized.has(name), 'duplicate_field'); normalized.set(name, value);}
    check([...normalized.keys()].every(k => schema.some(f => f[0] === k)), 'unknown_field');
    return schema.map(([name, tag, nullable, params]) => {
      if (!normalized.has(name)) {tick(depth); return [name, 'missing', null];}
      const v = normalized.get(name);
      if (v === null) {tick(depth); check(nullable, 'null_not_allowed'); return [name, 'null', null];}
      return [name, tag, value(v, tag, params, depth)];
    });
  }
  function value(raw: unknown, tag: LogicalType, params: Params, depth: number): Json {
    tick(depth); if (raw === null) return null;
    switch (tag) {
      case 'string': return nfc(raw);
      case 'boolean': check(typeof raw === 'boolean', 'invalid_boolean'); return raw;
      case 'signed_integer':
        if (typeof raw === 'number') {check(Number.isSafeInteger(raw), 'unsafe_integer'); return String(raw);}
        check(typeof raw === 'string' && /^-?(?:0|[1-9]\d*)$/.test(raw), 'invalid_integer'); return raw === '-0' ? '0' : raw;
      case 'decimal': return normalizeDecimal(raw, params.precision as number, params.scale as number);
      case 'date': check(typeof raw === 'string' && validDate(raw), 'invalid_date'); return raw;
      case 'timestamp': return normalizeTimestamp(raw, params.timestamp_precision as number);
      case 'array': {
        check(Array.isArray(raw), 'invalid_array'); const elem = params.element_type as {type: LogicalType; type_parameters: Params};
        return raw.map(v => value(v, elem.type, elem.type_parameters, depth + 1));
      }
      case 'object': return fields(raw, objectFields(params), depth + 1);
      default: throw new Error('unsupported_logical_type');
    }
  }
  const triples = fields(record, descriptors, 0);
  return {text: canonical(triples), cells: Object.fromEntries(triples.map(([name, kind, value]) => [name, {kind, value}]))};
}
