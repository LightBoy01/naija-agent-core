
// Improved Regex attempts - Iteration 3
// Added \b before N to avoid matching inside words like "Run"
// Added \b check for suffixes to avoid matching inside words

const priceRegex = /(?:(₦|#|Naira|NGN|\bN)\s*?(\d[\d,.]*))|(\d[\d,.]*)\s*(NGN|Naira)|(\b\d+(?:\.\d+)?[kK]\b)|(\b\d+(?:\.\d+)?[mM]\b)/gi;

function parsePrice(match: RegExpMatchArray): number | null {
    let rawStr = "";
    let multiplier = 1;

    if (match[2]) { // Prefix match: Group 2 is the number
        rawStr = match[2];
    } else if (match[3]) { // Suffix match: Group 3 is the number
        rawStr = match[3];
    } else if (match[5]) { // 'k' match
        rawStr = match[5].replace(/k/i, '');
        multiplier = 1000;
    } else if (match[6]) { // 'm' match
        rawStr = match[6].replace(/m/i, '');
        multiplier = 1000000;
    } else {
        return null;
    }

    // Clean up: remove commas, trailing dots
    rawStr = rawStr.replace(/,/g, '').replace(/\.$/, '');
    const val = parseFloat(rawStr);
    return isNaN(val) ? null : val * multiplier;
}

function testPriceGuard(text: string, knownPrices: number[]) {
    console.log(`\nTesting Text: "${text}"`);
    const matches = [...text.matchAll(priceRegex)];
    
    if (matches.length === 0) {
        console.log("  No prices detected.");
        return;
    }

    let finalMessage = text;
    for (const match of matches) {
        const parsedPrice = parsePrice(match);
        
        if (parsedPrice === null) {
             console.log(`  ❓ Could not parse: ${match[0]}`);
             continue;
        }

        console.log(`  Found Price: ${match[0]} -> Parsed: ${parsedPrice}`);

        // Fuzzy match (allow small difference)
        const isValid = knownPrices.some(p => Math.abs(p - parsedPrice) < 1);
        
        if (!isValid) {
            console.log(`  ❌ Redacting: ${match[0]}`);
            finalMessage = finalMessage.replace(match[0], "₦[Verification Pending]");
        } else {
            console.log(`  ✅ Validated: ${match[0]}`);
        }
    }
    console.log(`Result: "${finalMessage}"`);
}

// Test Cases
const knowledgePrices = [5000, 10000.50, 4000000]; 

// 1. Standard format
testPriceGuard("The price is ₦5,000 for the shoe.", knowledgePrices);
testPriceGuard("Price: N5000", knowledgePrices);

// 2. 'k' notation
testPriceGuard("It costs 5k usually.", knowledgePrices);

// 3. 'm' notation
testPriceGuard("That house is 4m.", knowledgePrices); 

// 4. Suffix
testPriceGuard("The total is 5000NGN.", knowledgePrices);

// 5. False Positives Check
testPriceGuard("Run 5km today.", knowledgePrices); 
testPriceGuard("I am N years old", knowledgePrices); // Should not match 'N' without number
