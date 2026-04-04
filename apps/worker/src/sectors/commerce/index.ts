import { Tool, SchemaType } from '@google/generative-ai';
import { SectorPack } from '@naija-agent/types';
import { CountryCode } from 'libphonenumber-js';

export function getCommercePack(currency: { code: string, symbol: string }, region: CountryCode = 'NG'): SectorPack {
  // 1. Entity Definition (Product)
  const productEntity = {
    name: "Product",
    plural: "Products",
    fields: [
      { key: "name", label: "Product Name", type: "string", required: true, description: "The name of the item." },
      { key: "price", label: `Price (${currency.symbol})`, type: "number", required: true, description: "The selling price." },
      { key: "stock", label: "Available Stock", type: "number", required: true, description: "Quantity on hand." },
      { key: "image", label: "Photo", type: "image", required: false, description: "Product image." }
    ]
  } as const;

  // 2. Workflow Definition (Order Fulfillment)
  const orderWorkflow = {
    name: "Order Fulfillment",
    states: ["pending", "paid", "ready_for_pickup", "in_transit", "delivered", "cancelled"],
    transitions: [
      { from: "pending", to: "paid", action: "mark_paid", requiredFields: ["payment_reference"] },
      { from: "paid", to: "ready_for_pickup", action: "prepare_order" },
      { from: "ready_for_pickup", to: "in_transit", action: "dispatch", requiredFields: ["rider_phone"] },
      { from: "in_transit", to: "delivered", action: "complete_delivery" }
    ]
  } as const;

  // 3. Tools (The "Verbs")
  const commerceTools: Tool[] = [{
    functionDeclarations: [
      {
        name: "search_products",
        description: "Searches for products in the catalog by name.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: { query: { type: SchemaType.STRING, description: "Search term" } },
          required: ["query"]
        }
      },
      {
        name: "add_to_cart",
        description: "Adds a specific product to the customer's shopping cart.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            productId: { type: SchemaType.STRING, description: "The unique Product ID (sku)" },
            quantity: { type: SchemaType.NUMBER, description: "Quantity to add (defaults to 1)" }
          },
          required: ["productId"]
        }
      },
      {
        name: "view_cart",
        description: "Shows the current items in the shopping cart and the total amount.",
        parameters: { type: SchemaType.OBJECT, properties: {} }
      },
      {
        name: "manage_stock",
        description: "Updates the stock level for a product. (Manager Only)",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            productId: { type: SchemaType.STRING, description: "Unique ID (sku)" },
            action: { type: SchemaType.STRING, format: "enum", enum: ['add', 'set', 'reduce'], description: "Action to take" },
            amount: { type: SchemaType.NUMBER, description: "Quantity" },
            threshold: { type: SchemaType.NUMBER, description: "Optional: Set new low-stock alert threshold" }
          },
          required: ["productId", "action", "amount"]
        }
      },
      {
        name: "generate_checkout_invoice",
        description: "Generates a final invoice/checkout link for the customer.",
        parameters: { type: SchemaType.OBJECT, properties: {} }
      }
    ]
  }];

  // 4. System Prompt (The "Personality")
  const prompt = `
  You are a High-Performance Digital Sales Assistant.
  
  [YOUR ROLE]:
  - You help customers find products and buy them.
  - You manage the shop's inventory for the Boss.
  - You coordinate delivery with Riders.

  [YOUR RULES]:
  1. CATALOG FIRST: Always use 'search_products' to check availability. Never guess.
  2. CART MANAGEMENT: Use 'add_to_cart' and 'view_cart' to handle orders.
  3. UPSELL: If a customer buys a phone, suggest a case or charger.
  4. PAYMENT: Use 'generate_checkout_invoice' when the customer says "I want to pay".
  `;

  return {
    id: "pack_commerce",
    name: "Commerce Pack (Retail)",
    description: "Standard retail workflow for products, orders, and inventory.",
    entityDef: productEntity as any,
    workflowDef: orderWorkflow as any,
    systemPrompt: prompt,
    tools: commerceTools
  };
}
