
const patterns = [
  /(?:Amt|Amount|Cr|Credit|Received|Value|Inflow)[:\s]+(?:NGN|N|#)?\s*([\d.]+)/i,
  /([\d.]+)\s*has\s*been\s*credited/i,
  /Acct:\s*\d+\s*Type:Cr\s*Amt:\s*([\d.]+)/i,
  /Trans\s*Amt:\s*NGN\s*([\d.]+)/i,
  /Inflow:\s*NGN\s*([\d.]+)/i,
  /successfully\s*credited\s*with\s*NGN\s*([\d.]+)/i
];

function extractAmount(body) {
  const cleanBody = body.replace(/,/g, '');
  for (const pattern of patterns) {
    const match = cleanBody.match(pattern);
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      if (!isNaN(amount) && amount > 0) return amount;
    }
  }
  return null;
}

const testCases = [
  { body: "Credit: NGN 5,000.00 Bal: NGN 50,000.00", expected: 5000 },
  { body: "Acct: 123** Type:Cr Amt: 10,000.00 Desc: Transfer", expected: 10000 },
  { body: "Txn: Debit Amt: 500.00 Bal: 4,500.00", expected: null }, // Should NOT match Debit
  { body: "Credit! You have received 2000 from Jide", expected: null }, // Weak match?
  { body: "FakeAlert: Amt: 50000 but actually 0", expected: 50000 }, // Naive regex will match
  { body: "Bal: NGN 2,000.00. No other amount.", expected: null } // Should NOT match Balance
];

console.log("--- Regex Test Results ---");
testCases.forEach((test, i) => {
  const result = extractAmount(test.body);
  const status = result === test.expected ? "PASS" : `FAIL (Got ${result}, Expected ${test.expected})`;
  console.log(`Test ${i + 1}: ${status} | "${test.body}"`);
});
