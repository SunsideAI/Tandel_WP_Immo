/**
 * Propstack-Feld-Werte liegen in zwei Formen vor:
 *
 *   1) Flach (direkter Wert):              `"city": "Halle"`
 *   2) {label, value}-Wrapper:             `"base_rent": { label: "Kaltmiete", value: 427 }`
 *
 * Flache Felder (laut aktuellem Propstack-Account):
 *   id, city, zip_code, street, house_number, country, rs_type, rs_category,
 *   object_type, marketing_type, unit_id, archived, project_id, broker_id,
 *   address, short_address, name, created_at, updated_at, images, property_status
 *
 * Alle anderen Felder sind in der Regel {label, value}-gewrapped.
 * Der Helper nimmt beide Formen entgegen.
 */

export interface LabeledValue<T = unknown> {
  label?: string;
  value: T;
}

export function isLabeledValue(v: unknown): v is LabeledValue<unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    'value' in (v as Record<string, unknown>)
  );
}

export function extractValue<T = unknown>(field: unknown): T | undefined {
  if (field === null || field === undefined) return undefined;
  if (isLabeledValue(field)) return field.value as T;
  return field as T;
}
