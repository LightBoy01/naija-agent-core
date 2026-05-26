import { PipelineContext, Interceptor } from '../types.js';
import { getOrgById, getStaff, getOrgOnboarding } from '@naija-agent/firebase';
import { parseAndFormatPhone } from '@naija-agent/types';
import { WhatsAppService } from '../../services/whatsapp.js';
import { getProvider } from '@naija-agent/payments';
import { getSectorPack } from '../../sectors/index.js';
import { CountryCode } from 'libphonenumber-js';
import { getTenantTools } from '../../tools.js';

export const OrgLoadInterceptor: Interceptor = {
  name: 'OrgLoad',
  execute: async (ctx: PipelineContext) => {
    // 1. Load Core Organization Data
    const org = await getOrgById(ctx.orgId);
    if (!org) {
      ctx.shortCircuit = true;
      ctx.shortCircuitReason = 'ORG_NOT_FOUND';
      return ctx;
    }

    // --- FINANCIAL SYNC (PHASE 9.3) ---
    // Overwrite Firestore balance with TiDB source of truth
    const { getDb, organizations } = await import('@naija-agent/database');
    const { eq } = await import('drizzle-orm');
    const sqlDb = getDb();
    const sqlResult = await sqlDb.select({ balanceKobo: organizations.balanceKobo })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);
    
    if (sqlResult[0]) {
       org.balance = sqlResult[0].balanceKobo;
    }

    ctx.org = org;

    // 2. Normalize Phones and Determine Identity
    const fromNormalized = parseAndFormatPhone(ctx.from) || ctx.from;
    const adminPhoneRaw = org.config?.adminPhone;
    const adminPhoneNormalized = adminPhoneRaw ? (parseAndFormatPhone(adminPhoneRaw) || adminPhoneRaw) : null;
    ctx.isAdmin = adminPhoneNormalized === fromNormalized;

    // 3. Load Staff Data (if not Admin)
    if (!ctx.isAdmin) {
      const staffData = await getStaff(ctx.orgId, ctx.from);
      ctx.staffData = staffData;
      ctx.isStaff = !!staffData && staffData.isActive;
    } else {
      ctx.isStaff = false;
      ctx.staffData = null;
    }

    // 4. Initialize Tenant-Specific Services
    const senderPhoneId = ctx.job.data.phoneId || org.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID || '';
    const senderToken = org.config?.whatsappToken || process.env.WHATSAPP_API_TOKEN || '';
    const senderSecret = org.config?.appSecret || process.env.WHATSAPP_APP_SECRET;

    ctx.tenantWhatsAppService = new WhatsAppService(senderToken, senderPhoneId, senderSecret);
    
    ctx.tenantPaymentProvider = org.config?.payment
      ? getProvider(org.config.payment.provider, org.config.payment.secretKey)
      : ctx.globalPaymentProvider;

    // 5. Check Offline Status (Admins can still talk to offline bots)
    if (!ctx.isAdmin && !org.isActive) {
       await ctx.tenantWhatsAppService.sendText(ctx.from, `👋 *${org.name}* is offline. Try again later.`);
       ctx.shortCircuit = true;
       ctx.shortCircuitReason = 'ORG_OFFLINE';
       return ctx;
    }

    // 6. Sector Pack & Tools Injection
    const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
    const regionRaw = org.region || 'NG';
    const region: CountryCode = (regionRaw === 'GLOBAL' ? 'NG' : regionRaw) as CountryCode;
    const sectorId = org.sector || 'commerce';
    
    ctx.sectorPack = getSectorPack(sectorId, currency, region);
    ctx.isLegacy = !!org.config?.legacy_whitelist;
    
    ctx.tenantTools = getTenantTools(
        ctx.isAdmin, 
        ctx.isStaff, 
        !!org.config?.isMaster, 
        !!ctx.tenantPaymentProvider, 
        currency, 
        region, 
        ctx.sectorPack,
        ctx.isLegacy
    );

    return ctx;
  }
};
