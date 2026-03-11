import { SchemaType, Tool, FunctionDeclaration } from '@google/generative-ai';

/**
 * Defines which tools require 4-digit PIN authentication (Boss Only).
 * This centralizes security logic to prevent bypasses when adding new tools.
 */
export const BOSS_ONLY_TOOLS = [
  'save_knowledge', 
  'delete_knowledge', 
  'create_tenant', 
  'get_network_stats', 
  'authorize_staff', 
  'deactivate_staff', 
  'save_product', 
  'delete_product',
  'manage_stock',
  'set_bot_status',
  'generate_login_code',
  'topup_tenant',
  'broadcast_to_bosses',
  'audit_tenant',
  'report_fraud',
  'request_otp_relay',
  'activate_tenant',
  'get_pending_setups'
];

export function getTenantTools(isAdmin: boolean, isStaff: boolean, isMaster: boolean, hasPayment: boolean): Tool[] {
  const allFunctionDeclarations: FunctionDeclaration[] = [];
  const isManager = isAdmin || isStaff;

  // 1. Transaction Verification & Payments (All users)
  allFunctionDeclarations.push({
    name: "get_payment_instructions",
    description: "Returns bank account details for payments (Sales or AI Credit Refills).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        purpose: { type: SchemaType.STRING, enum: ['sale', 'refill'], description: "Purpose: 'sale' (paying the Boss) or 'refill' (buying AI credits from the Sovereign)." }
      },
      required: ["purpose"]
    }
  });

  allFunctionDeclarations.push({
    name: "generate_refill_link",
    description: "Generates a secure Paystack payment link for the Boss to buy AI credits.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        amount: { type: SchemaType.NUMBER, description: "Amount in Naira (min 2000)" }
      },
      required: ["amount"]
    }
  });

  if (hasPayment) {
    allFunctionDeclarations.push({
      name: "verify_transaction",
      description: "Verifies a bank transaction with the payment provider.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          reference: { type: SchemaType.STRING, description: "Transaction Reference or Session ID" },
          amount: { type: SchemaType.NUMBER, description: "Amount in Naira" },
          bankName: { type: SchemaType.STRING, description: "Name of the sending bank" },
          date: { type: SchemaType.STRING, description: "Transaction date/time" },
          purpose: { type: SchemaType.STRING, enum: ['sale', 'refill'], description: "Context of the payment: 'sale' for customers, 'refill' for Boss topping up AI credits." }
        },
        required: ["reference", "amount", "purpose"]
      } as any
    });
  }

  allFunctionDeclarations.push({
    name: "generate_order_summary",
    description: "Generates a professional order summary for the customer including items and total. (All Users)",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        items: { type: SchemaType.STRING, description: "List of items and their individual prices" },
        total: { type: SchemaType.NUMBER, description: "Total amount in Naira" },
        orderId: { type: SchemaType.STRING, description: "A unique order reference (e.g. ORD-101)" }
      },
      required: ["items", "total", "orderId"]
    }
  });

  // 2. Manager Tools (BOSS & STAFF)
  if (isManager) {
    allFunctionDeclarations.push({
      name: "manage_activity",
      description: "Creates or updates a business activity (Waybill, Booking, Order).",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING, description: "Unique ID (e.g. WB102)" },
          type: { type: SchemaType.STRING, enum: ['order', 'booking', 'waybill', 'donation'], description: "Category" },
          status: { type: SchemaType.STRING, enum: ['pending', 'confirmed', 'picked_up', 'in_transit', 'delivered', 'cancelled'], description: "New status" },
          summary: { type: SchemaType.STRING, description: "Full details/update summary" },
          amount: { type: SchemaType.NUMBER, description: "Total value in Naira (for orders/donations)" },
          customerPhone: { type: SchemaType.STRING, description: "Optionally tag the customer phone" }
        },
        required: ["id", "type", "summary"]      }
    });

    allFunctionDeclarations.push({
      name: "book_slot",
      description: "Books a specific time slot for an appointment. Fails if taken.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          startTime: { type: SchemaType.STRING, description: "ISO 8601 Date String (e.g. 2026-03-10T14:00:00)" },
          summary: { type: SchemaType.STRING, description: "Client Name and Service Details" },
          customerPhone: { type: SchemaType.STRING, description: "Client Phone Number" }
        },
        required: ["startTime", "summary", "customerPhone"]
      }
    });

    allFunctionDeclarations.push({
      name: "assign_task_to_staff",
      description: "Assigns a business activity (Order/Waybill) to a specific staff member. (Boss Only)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          staffPhone: { type: SchemaType.STRING, description: "Phone number of the staff member (234...)" },
          activityId: { type: SchemaType.STRING, description: "ID of the activity to assign" },
          instruction: { type: SchemaType.STRING, description: "Special instructions for the staff" }
        },
        required: ["staffPhone", "activityId"]
      }
    });

    allFunctionDeclarations.push({
      name: "get_shipping_rates",
      description: "Gets real-time shipping quotes from carriers (Logistics/Retail).",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          origin: { type: SchemaType.STRING, description: "Origin City/Area" },
          destination: { type: SchemaType.STRING, description: "Destination City/Area" },
          weightKg: { type: SchemaType.NUMBER, description: "Weight in Kilograms" }
        },
        required: ["origin", "destination", "weightKg"]
      }
    });

    allFunctionDeclarations.push({
      name: "track_shipment",
      description: "Gets live tracking status for a shipment using a tracking number.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          trackingNumber: { type: SchemaType.STRING, description: "The tracking ID or waybill number" }
        },
        required: ["trackingNumber"]
      }
    });

    allFunctionDeclarations.push({
      name: "manage_stock",
      description: "Updates the stock level for a product. (Requires Manager Auth)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          productId: { type: SchemaType.STRING, description: "Unique ID (sku)" },
          action: { type: SchemaType.STRING, enum: ['add', 'set', 'reduce'], description: "Action to take" },
          amount: { type: SchemaType.NUMBER, description: "Quantity" },
          threshold: { type: SchemaType.NUMBER, description: "Optional: Set new low-stock alert threshold" }
        },
        required: ["productId", "action", "amount"]
      }
    });

    allFunctionDeclarations.push({
      name: "search_products",
      description: "Searches for products in the catalog by name.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: { query: { type: SchemaType.STRING, description: "Search term" } },
        required: ["query"]
      }
    });

    allFunctionDeclarations.push({
      name: "add_to_cart",
      description: "Adds a specific product to the customer's shopping cart. (Customer & Manager)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          productId: { type: SchemaType.STRING, description: "The unique Product ID" },
          quantity: { type: SchemaType.NUMBER, description: "Quantity to add (defaults to 1)" }
        },
        required: ["productId"]
      }
    });

    allFunctionDeclarations.push({
      name: "view_cart",
      description: "Shows the current items in the shopping cart and the total amount. (Customer & Manager)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {}
      }
    });

    allFunctionDeclarations.push({
      name: "clear_cart",
      description: "Empties all items from the shopping cart. (Customer & Manager)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {}
      }
    });

    allFunctionDeclarations.push({
      name: "remove_from_cart",
      description: "Removes a specific product (or reduces quantity) from the customer's shopping cart. (Customer & Manager)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          productId: { type: SchemaType.STRING, description: "The ID of the product to remove." },
          quantity: { type: SchemaType.NUMBER, description: "The quantity to remove. If omitted, the entire item is removed." }
        },
        required: ["productId"]
      }
    });

    // Strictly Boss-Only Tools
    if (isAdmin) {
      allFunctionDeclarations.push(
        {
          name: "verify_admin_pin",
          description: "Verifies the 4-digit PIN (Only for the Boss).",
          parameters: {
            type: SchemaType.OBJECT,
            properties: { pin: { type: SchemaType.STRING, description: "The 4-digit PIN." } },
            required: ["pin"]
          }
        },
        {
          name: "authorize_staff",
          description: "Authorizes a staff member (Rider/Assistant) via their phone number. (BOSS ONLY)",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              phone: { type: SchemaType.STRING, description: "Phone number (234...)" },
              name: { type: SchemaType.STRING, description: "Staff name" },
              role: { type: SchemaType.STRING, enum: ['rider', 'assistant', 'teacher'], description: "Role" }
            },
            required: ["phone", "name", "role"]
          }
        },
        {
          name: "deactivate_staff",
          description: "Removes staff access. (BOSS ONLY)",
          parameters: {
            type: SchemaType.OBJECT,
            properties: { phone: { type: SchemaType.STRING, description: "Phone number to deactivate" } },
            required: ["phone"]
          }
        },
        {
          name: "set_bot_status",
          description: "Turns the AI agent ON or OFF for customers. (BOSS ONLY)",
          parameters: {
            type: SchemaType.OBJECT,
            properties: { active: { type: SchemaType.BOOLEAN, description: "True to start, False to stop" } },
            required: ["active"]
          }
        },
        {
          name: "send_broadcast",
          description: "Sends a marketing message to recent customers. (BOSS ONLY)",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              message: { type: SchemaType.STRING, description: "The marketing message content" },
              target: { type: SchemaType.STRING, enum: ['all', 'recent'], description: "Target group" }
            },
            required: ["message"]
          }
        },
        {
          name: "get_business_report",
          description: "Generates a summary of recent sales, activities, and AI recommendations. (BOSS ONLY)",
          parameters: {
            type: SchemaType.OBJECT,
            properties: { period: { type: SchemaType.STRING, enum: ['daily', 'weekly'], description: "Reporting period" } },
            required: ["period"]
          }
        },
        {
          name: "save_knowledge",
          description: "Updates business facts or prices. (Requires Boss Auth)",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              key: { type: SchemaType.STRING, description: "Key name" },
              content: { type: SchemaType.STRING, description: "Details/Price" },
              imageUrl: { type: SchemaType.STRING, description: "Product Image URL" }
            },
            required: ["key", "content"]
          }
        },
        {
          name: "delete_knowledge",
          description: "Deletes obsolete business knowledge. (Requires Boss Auth)",
          parameters: {
            type: SchemaType.OBJECT,
            properties: { key: { type: SchemaType.STRING, description: "Key to delete" } },
            required: ["key"]
          }
        },
        {
          name: "save_product",
          description: "Adds or updates a product in the catalog. (Requires Boss Auth)",
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              id: { type: SchemaType.STRING, description: "Unique ID (e.g. sku-123)" },
              name: { type: SchemaType.STRING, description: "Product name" },
              price: { type: SchemaType.NUMBER, description: "Price in Naira" },
              stock: { type: SchemaType.NUMBER, description: "Available quantity" },
              category: { type: SchemaType.STRING, description: "e.g. Electronics, Fashion" },
              imageUrl: { type: SchemaType.STRING, description: "Product Image URL" }
            },
            required: ["id", "name", "price"]
          }
        },
        {
          name: "delete_product",
          description: "Removes a product from the catalog. (Requires Boss Auth)",
          parameters: {
            type: SchemaType.OBJECT,
            properties: { id: { type: SchemaType.STRING, description: "Product ID to delete" } },
            required: ["id"]
          }
        }
      );
    }
  }

  // 3. Master Tools (Sovereign Only)
  if (isMaster) {
    allFunctionDeclarations.push({
      name: "register_trial_interest",
      description: "Captures a new lead's interest in a free setup trial. (Master Bot Only, Publicly Available)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING, description: "Organization slug (e.g. kudirat_kitchen)" },
          name: { type: SchemaType.STRING, description: "Business display name" },
          adminPhone: { type: SchemaType.STRING, description: "The Boss's personal WhatsApp (234...)" },
          botPhone: { type: SchemaType.STRING, description: "The new SIM number for the bot (234...)" }
        },
        required: ["id", "name", "adminPhone", "botPhone"]
      }
    });
  }

  if (isAdmin && isMaster) {
    allFunctionDeclarations.push(
      {
        name: "create_tenant",
        description: "Onboards a new client business. (Sovereign Only)",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            id: { type: SchemaType.STRING, description: "Unique slug" },
            name: { type: SchemaType.STRING, description: "Display name" },
            adminPhone: { type: SchemaType.STRING, description: "Boss phone" },
            phoneId: { type: SchemaType.STRING, description: "WhatsApp Phone ID" },
            prompt: { type: SchemaType.STRING, description: "AI personality" }
          },
          required: ["id", "name", "adminPhone", "phoneId", "prompt"]
        } as any
      },
      {
        name: "get_network_stats",
        description: "Retrieves network-wide stats. (Sovereign Only)",
        parameters: { type: SchemaType.OBJECT, properties: {} }
      },
      {
        name: "generate_login_code",
        description: "Generates a 6-digit dashboard login code. (Sovereign Only)",
        parameters: { type: SchemaType.OBJECT, properties: {} }
      },
      {
        name: "topup_tenant",
        description: "Tops up a tenant's credit balance (₦). (Sovereign Only)",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            tenantId: { type: SchemaType.STRING, description: "Organization slug (e.g. bims_gadgets)" },
            amount: { type: SchemaType.NUMBER, description: "Amount in Naira (e.g. 5000)" },
            reference: { type: SchemaType.STRING, description: "Unique payment reference/session ID." }
          },
          required: ["tenantId", "amount", "reference"]
        }
      },
      {
        name: "broadcast_to_bosses",
        description: "Sends a broadcast message to all business owners in the network. (Sovereign Only)",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            message: { type: SchemaType.STRING, description: "The message to send to all Bosses." }
          },
          required: ["message"]
        }
      },
      {
        name: "audit_tenant",
        description: "Retrieves a deep audit of a specific tenant (health, balance, recent errors). (Sovereign Only)",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            tenantId: { type: SchemaType.STRING, description: "Organization slug to audit." }
          },
          required: ["tenantId"]
        }
      },
      {
        name: "report_fraud",
        description: "Adds a phone number to the global network-wide fraud blacklist. (Sovereign Only)",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            phone: { type: SchemaType.STRING, description: "Customer phone number (234...)" },
            reason: { type: SchemaType.STRING, description: "Reason for blacklisting (e.g. Fake Receipt)" }
          },
          required: ["phone", "reason"]
        }
      },
      {
        name: "request_otp_relay",
        description: "Initiates the 5-minute remote OTP relay for a specific tenant. (Sovereign Only)",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            tenantId: { type: SchemaType.STRING, description: "Organization slug" }
          },
          required: ["tenantId"]
        }
      },
      {
        name: "activate_tenant",
        description: "Finalizes activation after Meta OTP is verified. (Sovereign Only)",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            tenantId: { type: SchemaType.STRING, description: "Organization slug" },
            phoneId: { type: SchemaType.STRING, description: "The Meta WhatsApp Phone ID" },
            accessToken: { type: SchemaType.STRING, description: "The permanent Meta access token" }
          },
          required: ["tenantId", "phoneId", "accessToken"]
        }
      },
      {
        name: "get_pending_setups",
        description: "Retrieves a list of all businesses waiting for activation or payment. (Sovereign Only)",
        parameters: { type: SchemaType.OBJECT, properties: {} }
      }
    );
  }

  // 4. Escalation (Customer Only)
  if (!isManager) {
    allFunctionDeclarations.push({
      name: "escalate_to_boss",
      description: "Pings the business owner for assistance.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: { reason: { type: SchemaType.STRING, description: "Reason" } },
        required: ["reason"]
      } as any
    });
  }

  return [{ functionDeclarations: allFunctionDeclarations }];
}
