import dotenv from 'dotenv';
import { lifeMemory } from '../apps/worker-life/src/services/lifeMemory.js';
import { handleVaultDeposit } from '../apps/worker-life/src/handlers/billingHandler.js';
import { executeLifeTool } from '../apps/worker-life/src/tools.js';

dotenv.config();

/**
 * 🧪 Alajo System Simulation (FIXED)
 */
async function runAlajoSimulation() {
  const testPhone = '2348000000000_TEST';
  const depositAmount = 3000;
  const depositRef = `test_vault_${Date.now()}`;

  console.log(`\n🚀 Starting Alajo Simulation for user: ${testPhone}`);

  try {
    // --- STEP 1: Deposit ---
    console.log(`\n🏦 Step 1: Simulating Vault Deposit (₦${depositAmount})...`);
    const depositJob = {
      data: { phone: testPhone, amount: depositAmount, reference: depositRef }
    } as any;
    await handleVaultDeposit(depositJob);

    // --- STEP 2: Statement ---
    console.log(`\n📊 Step 2: Checking Balance Statement...`);
    const statement = await executeLifeTool('get_financial_statement', { userId: testPhone, action: 'check_balance' });
    console.log('✅ Current Balance:', { Vault: statement.vaultBalanceNaira, Energy: statement.energyCredits });

    // --- STEP 3: Conversion ---
    const convertAmount = 1000;
    console.log(`\n🔋 Step 3: Converting ₦${convertAmount} to Energy...`);
    const conversion = await executeLifeTool('convert_vault_to_energy', { userId: testPhone, amountNaira: convertAmount });
    console.log('✅ Conversion Result:', conversion.message);

    // --- STEP 4: Verification ---
    console.log(`\n🏁 Step 4: Final Verification...`);
    const final = await executeLifeTool('get_financial_statement', { userId: testPhone, action: 'check_balance' });
    
    console.log('\n--- Final Ledger ---');
    console.log(`Vault: ₦${final.vaultBalanceNaira} (Expected ₦${depositAmount - convertAmount})`);
    console.log(`Energy: ${final.energyCredits} (Expected ${100 + (convertAmount/10)})`);

  } catch (error: any) {
    console.error('❌ Simulation Error:', error.message);
  } finally {
    process.exit(0);
  }
}

runAlajoSimulation();
