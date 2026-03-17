import { parsePhoneNumber, PhoneNumber, CountryCode, getCountryCallingCode } from 'libphonenumber-js';

export function parseAndFormatPhone(phone: string, defaultRegion: CountryCode = 'NG'): string | null {
  try {
    const phoneNumber = parsePhoneNumber(phone, defaultRegion);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.number as string; // Returns E.164 format (e.g. +2348012345678)
    }
  } catch (error) {
    // Invalid phone number format
  }
  return null;
}

export function formatPhoneForDisplay(phone: string): string {
  try {
    const phoneNumber = parsePhoneNumber(phone);
    if (phoneNumber) {
      return phoneNumber.formatInternational();
    }
  } catch (error) {
    // Fallback
  }
  return phone;
}

export function getRegionFromPhone(phone: string): CountryCode | undefined {
  try {
    const phoneNumber = parsePhoneNumber(phone);
    if (phoneNumber) {
      return phoneNumber.country;
    }
  } catch (error) {
    // Invalid
  }
  return undefined;
}

export function getPhoneExample(region: CountryCode = 'NG'): string {
  try {
    const callingCode = getCountryCallingCode(region);
    return `${callingCode}...`;
  } catch (e) {
    return '234...';
  }
}
