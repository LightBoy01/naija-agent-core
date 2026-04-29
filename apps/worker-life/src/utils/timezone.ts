import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Comprehensive mapping of country codes to their primary timezones.
 */
const COUNTRY_TIMEZONES: Record<string, string> = {
  'NG': 'Africa/Lagos',
  'GH': 'Africa/Accra',
  'KE': 'Africa/Nairobi',
  'ZA': 'Africa/Johannesburg',
  'EG': 'Africa/Cairo',
  'ET': 'Africa/Addis_Ababa',
  'GB': 'Europe/London',
  'US': 'America/New_York',
  'CA': 'America/Toronto',
  'DE': 'Europe/Berlin',
  'FR': 'Europe/Paris',
  'IN': 'Asia/Kolkata',
  'CN': 'Asia/Shanghai',
  'JP': 'Asia/Tokyo',
  'AE': 'Asia/Dubai',
  'SA': 'Asia/Riyadh',
  'BR': 'America/Sao_Paulo',
  'AU': 'Australia/Sydney',
  'RU': 'Europe/Moscow',
  'PK': 'Asia/Karachi',
  'ID': 'Asia/Jakarta',
  'TR': 'Europe/Istanbul',
};

/**
 * Guesses the timezone based on the phone number prefix.
 */
export function getTimezoneFromPhone(phone: string): string {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone.startsWith('+') ? phone : `+${phone}`);
    if (!phoneNumber || !phoneNumber.country) return 'Africa/Lagos';

    return COUNTRY_TIMEZONES[phoneNumber.country] || 'Africa/Lagos';
  } catch (e) {
    return 'Africa/Lagos';
  }
}
