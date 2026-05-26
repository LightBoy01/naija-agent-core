import { Type } from '@google/genai';
import { CountryCode } from 'libphonenumber-js';
import { getPhoneExample } from '../../utils/phone.js';

/**
 * Returns the legacy commerce and activity tools for backward compatibility.
 * These are used when no sector pack is provided.
 */
export function getLegacyCommerceTools(
  isAdmin: boolean,
  isStaff: boolean,
  orgCurrency: { code: string, symbol: string, locale: string },
  orgRegion: CountryCode
): any[] {
  const allFunctionDeclarations: any[] = [];
  const isManager = isAdmin || isStaff;
  const phoneExample = getPhoneExample(orgRegion);

  // --- CUSTOMER TOOLS ---
  allFunctionDeclarations.push({
    name: "generate_order_summary",
    description: "Generates a professional order summary for the customer including items and total. (All Users)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: { type: Type.STRING, description: "List of items and their individual prices" },
        total: { type: Type.NUMBER, description: `Total amount in ${orgCurrency.code}` },
        orderId: { type: Type.STRING, description: "A unique order reference (e.g. ORD-101)" }
      },
      required: ["items", "total", "orderId"]
    }
  });

  allFunctionDeclarations.push({
    name: "generate_checkout_invoice",
    description: "Generates a final invoice for the items in the cart, including a payment link (if available) or bank transfer details. Call this when the user is ready to pay.",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  });

  allFunctionDeclarations.push({
    name: "check_order_status",
    description: "Checks the status of your most recent order. (All Users)",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  });

  allFunctionDeclarations.push({
    name: "add_to_cart",
    description: "Adds a specific product to the customer's shopping cart. (Customer & Manager)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING, description: "The unique Product ID" },
        quantity: { type: Type.NUMBER, description: "Quantity to add (defaults to 1)" }
      },
      required: ["productId"]
    }
  });

  allFunctionDeclarations.push({
    name: "view_cart",
    description: "Shows the current items in the shopping cart and the total amount. (Customer & Manager)",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  });

  allFunctionDeclarations.push({
    name: "clear_cart",
    description: "Empties all items from the shopping cart. (Customer & Manager)",
    parameters: {
      type: Type.OBJECT,
      properties: {}
    }
  });

  allFunctionDeclarations.push({
    name: "remove_from_cart",
    description: "Removes a specific product (or reduces quantity) from the customer's shopping cart. (Customer & Manager)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING, description: "The ID of the product to remove." },
        quantity: { type: Type.NUMBER, description: "The quantity to remove. If omitted, the entire item is removed." }
      },
      required: ["productId"]
    }
  });

  allFunctionDeclarations.push({
    name: "search_products",
    description: "Searches for products in the catalog by name.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: "Search term" } },
      required: ["query"]
    }
  });

  // --- MANAGER TOOLS ---
  if (isManager) {
    allFunctionDeclarations.push({
      name: "manage_activity",
      description: "Creates or updates a business activity (Waybill, Booking, Order).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "Unique ID (e.g. WB102)" },
          type: { type: Type.STRING, format: "enum", enum: ['order', 'booking', 'waybill', 'donation'], description: "Category" },
          status: { type: Type.STRING, format: "enum", enum: ['pending', 'confirmed', 'picked_up', 'in_transit', 'delivered', 'cancelled'], description: "New status" },
          summary: { type: Type.STRING, description: "Full details/update summary" },
          amount: { type: Type.NUMBER, description: `Total value in ${orgCurrency.code} (for orders/donations)` },
          customerPhone: { type: Type.STRING, description: "Optionally tag the customer phone" }
        },
        required: ["id", "type", "summary"]
      }
    });

    allFunctionDeclarations.push({
      name: "book_slot",
      description: "Books a specific time slot for an appointment. Fails if taken.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          startTime: { type: Type.STRING, description: "ISO 8601 Date String (e.g. 2026-03-10T14:00:00)" },
          summary: { type: Type.STRING, description: "Client Name and Service Details" },
          customerPhone: { type: Type.STRING, description: "Client Phone Number" }
        },
        required: ["startTime", "summary", "customerPhone"]
      }
    });

    allFunctionDeclarations.push({
      name: "assign_task_to_staff",
      description: "Assigns a business activity (Order/Waybill) to a specific staff member. (Boss Only)",
      parameters: {
        type: Type.OBJECT,
        properties: {
          staffPhone: { type: Type.STRING, description: `Phone number of the staff member (${phoneExample})` },
          activityId: { type: Type.STRING, description: "ID of the activity to assign" },
          instruction: { type: Type.STRING, description: "Special instructions for the staff" }
        },
        required: ["staffPhone", "activityId"]
      }
    });

    allFunctionDeclarations.push({
      name: "get_shipping_rates",
      description: "Gets real-time shipping quotes from carriers (Logistics/Retail).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          origin: { type: Type.STRING, description: "Origin City/Area" },
          destination: { type: Type.STRING, description: "Destination City/Area" },
          weightKg: { type: Type.NUMBER, description: "Weight in Kilograms" }
        },
        required: ["origin", "destination", "weightKg"]
      }
    });

    allFunctionDeclarations.push({
      name: "track_shipment",
      description: "Gets live tracking status for a shipment using a tracking number.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          trackingNumber: { type: Type.STRING, description: "The tracking ID or waybill number" }
        },
        required: ["trackingNumber"]
      }
    });

    allFunctionDeclarations.push({
      name: "get_recent_activities",
      description: "Retrieves the last 10 activities (Orders, Bookings, Waybills) for the business. (Manager Only)",
      parameters: {
        type: Type.OBJECT,
        properties: {
          limit: { type: Type.NUMBER, description: "Number of activities to fetch (max 20, default 10)" }
        }
      }
    });

    allFunctionDeclarations.push({
      name: "manage_stock",
      description: "Updates the stock level for a product. (Requires Manager Auth)",
      parameters: {
        type: Type.OBJECT,
        properties: {
          productId: { type: Type.STRING, description: "Unique ID (sku)" },
          action: { type: Type.STRING, format: "enum", enum: ['add', 'set', 'reduce'], description: "Action to take" },
          amount: { type: Type.NUMBER, description: "Quantity" },
          threshold: { type: Type.NUMBER, description: "Optional: Set new low-stock alert threshold" }
        },
        required: ["productId", "action", "amount"]
      }
    });

    allFunctionDeclarations.push({
      name: "get_staff_tasks",
      description: "Retrieves a list of all pending tasks or deliveries assigned to the current staff member. (Staff Only)",
      parameters: {
        type: Type.OBJECT,
        properties: {}
      }
    });
  }

  // --- BOSS ONLY TOOLS ---
  if (isAdmin) {
    allFunctionDeclarations.push(
      {
        name: "save_product",
        description: "Adds or updates a product in the catalog. (Requires Boss Auth)",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "Unique ID (e.g. sku-123)" },
            name: { type: Type.STRING, description: "Product name" },
            price: { type: Type.NUMBER, description: `Price in ${orgCurrency.code}` },
            stock: { type: Type.NUMBER, description: "Available quantity" },
            category: { type: Type.STRING, description: "e.g. Electronics, Fashion" },
            imageUrl: { type: Type.STRING, description: "Product Image URL" }
          },
          required: ["id", "name", "price"]
        }
      },
      {
        name: "delete_product",
        description: "Removes a product from the catalog. (Requires Boss Auth)",
        parameters: {
          type: Type.OBJECT,
          properties: { id: { type: Type.STRING, description: "Product ID to delete" } },
          required: ["id"]
        }
      }
    );
  }

  return allFunctionDeclarations;
}
