import { WhatsAppService } from '../services/whatsapp.js';
import { PaymentProvider } from '@naija-agent/payments';
import { Redis } from 'ioredis';
import { Config, SectorPack } from '@naija-agent/types';

export interface HandlerContext {
  orgId: string;
  from: string;
  isStaff: boolean;
  isAdmin: boolean;
  isAuth: boolean;
  whatsappService: WhatsAppService;
  paymentProvider: PaymentProvider | null;
  redisClient: Redis;
  orgConfig: Config;
  currency: { code: string, symbol: string, locale: string };
  whatsappPhoneId: string;
  customerName?: string;
  isVisionContext?: boolean;
  sectorPack?: SectorPack;
}

/**
 * List of tools that REQUIRE active 2-hour session auth (Boss Only).
 * If a tool is in this list, the AI will prompt for a 4-digit PIN.
 */
export const AUTH_REQUIRED_TOOLS = [
  'save_knowledge', 
  'delete_knowledge', 
  'save_product', 
  'bulk_save_products',
  'delete_product', 
  'authorize_staff', 
  'deactivate_staff', 
  'set_bot_status', 
  'create_tenant', 
  'topup_tenant', 
  'generate_login_code', 
  'broadcast_to_bosses', 
  'audit_tenant', 
  'report_fraud',
  'web_search', 
  'activate_tenant', 
  'get_pending_setups', 
  'get_network_stats',
  'manage_stock',
  'get_business_report',
  'get_customer_info'
];
