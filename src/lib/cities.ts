/** Cities offered as a patient's default search city. */

export const DEFAULT_CITY = 'Abuja';

export const CITIES = [
  'Abuja',
  'Lagos',
  'Port Harcourt',
  'Kano',
  'Ibadan',
  'Enugu',
  'Kaduna',
  'Benin City',
  'Jos',
  'Calabar',
] as const;

export type City = (typeof CITIES)[number];

export function isKnownCity(value: unknown): value is City {
  return typeof value === 'string' && (CITIES as readonly string[]).includes(value);
}
