import { HandlerContext, AUTH_REQUIRED_TOOLS } from './tools/definitions.js';
import { handleCommerceTools } from './tools/commerce.js';
import { handleInventoryTools } from './tools/inventory.js';
import { handleAdminTools } from './tools/admin.js';
import { handleContentTools } from './tools/content.js';
import { handleSystemTools } from './tools/system.js';

export { HandlerContext, AUTH_REQUIRED_TOOLS };

export async function handleToolCall(
  name: string, 
  args: any, 
  ctx: HandlerContext
): Promise<any> {
  const { isAuth } = ctx;

  // 🛡️ [SPINAL CORD]: Deterministic Security Gatekeeper
  // If the tool is Boss-Only and the session is not auth'd, kill it immediately.
  if (AUTH_REQUIRED_TOOLS.includes(name) && !isAuth) {
    return { 
      status: 'error', 
      code: 'AUTH_REQUIRED', 
      message: 'This action is LOCKED. Oga, please type your 4-digit PIN to proceed.' 
    };
  }

  // Dispatch to specialized handlers
  
  // 1. Inventory & Products
  if (['save_product', 'manage_stock', 'delete_product', 'search_products'].includes(name)) {
    return await handleInventoryTools(name, args, ctx);
  }

  // 2. Commerce (Orders, Cart, Payments)
  if ([
    'get_payment_instructions', 'generate_order_summary', 'check_order_status', 
    'generate_refill_link', 'verify_transaction', 'get_shipping_rates', 
    'track_shipment', 'add_to_cart', 'view_cart', 'remove_from_cart', 
    'clear_cart', 'book_slot', 'generate_checkout_invoice'
  ].includes(name)) {
    return await handleCommerceTools(name, args, ctx);
  }

  // 3. Admin & Staff
  if ([
    'authorize_staff', 'deactivate_staff', 'assign_task_to_staff', 'manage_activity', 
    'get_staff_tasks', 'set_bot_status', 'get_business_report', 'send_broadcast', 
    'verify_admin_pin', 'request_human_handoff', 'get_customer_info', 'get_recent_activities',
    'review_customer_chat'
  ].includes(name)) {
    return await handleAdminTools(name, args, ctx);
  }

  // 4. Content & AI
  if (['save_knowledge', 'delete_knowledge', 'web_search', 'generate_image'].includes(name)) {
    return await handleContentTools(name, args, ctx);
  }

  // 5. System & Multi-tenancy
  if ([
    'create_tenant', 'topup_tenant', 'broadcast_to_bosses', 'audit_tenant', 
    'report_fraud', 'register_trial_interest', 'request_otp_relay', 
    'activate_tenant', 'get_pending_setups', 'get_network_stats', 'generate_login_code'
  ].includes(name)) {
    return await handleSystemTools(name, args, ctx);
  }

  throw new Error(`Unknown tool: ${name}`);
}
