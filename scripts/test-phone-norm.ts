import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';

function normalize(phone: string, region: CountryCode = 'NG'): string | null {
  try {
    const phoneNumber = parsePhoneNumber(phone, region);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.number as string;
    } else {
      if (phoneNumber) console.log(`   [DEBUG] Parsed but invalid: possible=${phoneNumber.isPossible()}, country=${phoneNumber.country}`);
    }
  } catch (e: any) {
    console.log(`   [DEBUG] Parse error: ${e.message}`);
  }
  return null;
}

const testNumbers = [
  { input: '08012345678', region: 'NG', expected: '+2348012345678' },
  { input: '+234 801 234 5678', region: 'NG', expected: '+2348012345678' },
  { input: '202-555-0123', region: 'US', expected: '+12025550123' },
  { input: '+1 202 555 0123', region: 'US', expected: '+12025550123' },
  { input: '07123 456789', region: 'GB', expected: '+447123456789' },
  { input: '+44 7123 456789', region: 'GB', expected: '+447123456789' },
  { input: '+1 (555) 189-6202', region: 'US', expected: '+15551896202' },
  { input: '+1 (212) 189-6202', region: 'US', expected: '+12121896202' },
  { input: '1 (212) 189-6202', region: 'US', expected: '+12121896202' },
  { input: '+1 (650) 253-0000', region: 'US', expected: '+16502530000' },
  { input: '+1 555 189 6202', region: 'US', expected: '+15551896202' },
  { input: '+1 212 555 0123', region: 'US', expected: '+12125550123' },
  { input: '+1 310 555 0123', region: 'US', expected: '+13105550123' },
  { input: '+1 310 289 6202', region: 'US', expected: '+13102896202' },
  { input: 'invalid-number', region: 'NG', expected: null }
];

console.log('🧪 Testing Phone Normalization...\n');

testNumbers.forEach(({ input, region, expected }) => {
  const result = normalize(input, region as CountryCode);
  const status = result === expected ? '✅' : '❌';
  console.log(`${status} [${region}] ${input} -> ${result} (Expected: ${expected})`);
});
