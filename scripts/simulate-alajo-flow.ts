import dotenv from 'dotenv';
import { lifeMemory } from '../apps/worker-life/src/services/lifeMemory.js';
import { executeLifeTool } from '../apps/worker-life/src/tools/index.js';

dotenv.config();

/**
 * 🧪 Alajo System Simulation (FIXED)
 */
async function runAlajoSimulation() {
  const testPhone = '2348000000000_TEST';
  const depositAmountNaira = 3000;
  const depositAmountKobo = depositAmountNaira * 100;
  const depositRef = `test_vault_${Date.now()}`;

  console.log(`\n🚀 Starting Alajo Simulation for user: ${testPhone}`);

  try {
    // --- STEP 1: Deposit ---
    console.log(`\n🏦 Step 1: Simulating Vault Deposit (₦${depositAmountNaira})...`);
    await lifeMemory.addVaultBalance(testPhone, depositAmountKobo, depositRef);

    // --- STEP 1.5: PIN Setup ---
    console.log(`\n🔐 Step 1.5: Setting User PIN...`);
    const pin = '8888';
    await lifeMemory.updateContext(testPhone, { pin: pin }); // Using legacy field for simulation test consistency

    // --- STEP 2: Statement ---
    console.log(`\n📊 Step 2: Checking Balance Statement...`);
    const statement = await executeLifeTool('get_financial_statement', { userId: testPhone, action: 'check_balance' }, 'sim-job-1');
    console.log('✅ Current Balance:', { Vault: statement.vaultBalanceNaira, Energy: statement.energyCredits });

    // --- STEP 3: Conversion ---
    const convertAmount = 1000;
    console.log(`\n🔋 Step 3: Converting ₦${convertAmount} to Energy...`);
    const conversion = await executeLifeTool('convert_vault_to_energy', { userId: testPhone, amountNaira: convertAmount, pin: pin }, 'sim-job-2');
    console.log('✅ Conversion Result:', conversion.message);

    // --- STEP 4: Success-Only Billing Test (Refund) ---
    console.log(`\n🛠️ Step 4: Testing Success-Only Billing (Refund)...`);
    const initialEnergy = (await lifeMemory.getContext(testPhone)).energyCredits || 0;
    const toolCost = 3; // 3 credits for web search
    
    console.log(`Initial Energy: ${initialEnergy}. Simulating Tool Call costing ${toolCost} credits...`);
    
    // Simulate the flow from chatHandler.ts
    await lifeMemory.deductEnergy(testPhone, toolCost);
    console.log(`Deducted ${toolCost} credits. Simulating tool failure...`);
    
    // Trigger refund
    const { billingService } = await import('../apps/worker-life/src/services/billingService.js');
    await billingService.refundCredits(testPhone, toolCost);
    
    const refundedEnergy = (await lifeMemory.getContext(testPhone)).energyCredits || 0;
    console.log(`✅ Final Energy after Refund: ${refundedEnergy}. Refund Successful: ${initialEnergy === refundedEnergy}`);

    // --- STEP 5: Verification ---
    console.log(`\n🏁 Step 5: Final Verification...`);
    const final = await executeLifeTool('get_financial_statement', { userId: testPhone, action: 'check_balance' }, 'sim-job-3');
    
    console.log('\n--- Final Ledger ---');
    console.log(`Vault: ₦${final.vaultBalanceNaira} (Expected ₦${depositAmountNaira - convertAmount})`);
    console.log(`Energy: ${final.energyCredits} (Expected ${100 + (convertAmount/10)})`);

  } catch (error: any) {
    console.error('❌ Simulation Error:', error.message);
  } finally {
    process.exit(0);
  }
}

runAlajoSimulation();
