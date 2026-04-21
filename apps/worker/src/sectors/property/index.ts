import { Type } from '@google/genai';
import { SectorPack } from '@naija-agent/types';
import { CountryCode } from 'libphonenumber-js';
import { saveEntity, queryEntity } from '@naija-agent/firebase';

export function getPropertyPack(currency: { code: string, symbol: string }, region: CountryCode = 'NG'): SectorPack {
  const propertyEntity = {
    name: "Property",
    plural: "Properties",
    fields: [
      { key: "title", label: "Property Title", type: "string", required: true, description: "e.g., 3 Bedroom Flat in Lekki" },
      { key: "price", label: `Price (${currency.symbol})`, type: "number", required: true, description: "Rent or Sale price" },
      { key: "location", label: "Location", type: "string", required: true, description: "Area or Address" },
      { key: "type", label: "Property Type", type: "enum", options: ["Rent", "Sale", "Shortlet"], required: true },
      { key: "status", label: "Status", type: "enum", options: ["Available", "Taken"], required: true },
      { key: "image", label: "Photo", type: "image", required: false, description: "Property image." }
    ]
  } as const;

  const viewingWorkflow = {
    name: "Property Viewing",
    states: ["inquiry", "scheduled", "viewed", "offer_made", "closed"],
    transitions: [
      { from: "inquiry", to: "scheduled", action: "schedule_viewing", requiredFields: ["client_name", "date", "time"] },
      { from: "scheduled", to: "viewed", action: "client_viewed" },
      { from: "viewed", to: "offer_made", action: "make_offer" },
      { from: "offer_made", to: "closed", action: "accept_offer" }
    ]
  } as const;

  const propertyTools: any[] = [{
    functionDeclarations: [
      {
        name: "search_properties",
        description: "Search for available properties based on location, type, or max budget.",
        parameters: {
          type: Type.OBJECT,
          properties: { 
            location: { type: Type.STRING, description: "e.g., Lekki, Ikeja, Abuja" },
            type: { type: Type.STRING, description: "Rent, Sale, or Shortlet" },
            maxBudget: { type: Type.NUMBER, description: "Maximum price the client can afford" }
          },
        }
      },
      {
        name: "schedule_viewing",
        description: "Schedule a physical or virtual viewing for a property.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            propertyId: { type: Type.STRING, description: "The ID of the property to view" },
            clientName: { type: Type.STRING, description: "Full Name of the client" },
            clientPhone: { type: Type.STRING, description: "Phone Number of the client" },
            date: { type: Type.STRING, description: "YYYY-MM-DD" },
            time: { type: Type.STRING, description: "HH:MM (24hr)" }
          },
          required: ["propertyId", "clientName", "clientPhone", "date", "time"]
        }
      }
    ]
  }];

  const prompt = `
  You are an Expert Real Estate Agent Assistant.
  
  [YOUR ROLE]:
  - You help clients find properties (Rent, Sale, Shortlet).
  - You answer questions about property prices and locations.
  - You help schedule property viewings.
  - You are PROFESSIONAL, PERSUASIVE, and HELPFUL.

  [YOUR RULES]:
  1. SEARCH FIRST: Always use 'search_properties' when a client asks what's available. Never invent listings.
  2. PRE-QUALIFY: Gently ask for their budget and preferred location if they don't provide it.
  3. VIEWING: If they like a property, immediately offer to schedule a viewing using 'schedule_viewing'.
  `;

  return {
    id: "pack_property",
    name: "Property Pack (Real Estate)",
    description: "Property listings and viewing scheduling for real estate.",
    entityDef: propertyEntity as any,
    workflowDef: viewingWorkflow as any,
    systemPrompt: prompt,
    tools: propertyTools,
    execute: async (toolName: string, args: Record<string, unknown>, deps: any) => {
      console.log(`🏠 [PropertyPack] Executing ${toolName}`, args);
      const { orgId } = deps;

      switch (toolName) {
        case 'search_properties': {
          let properties = await queryEntity(orgId, 'properties', [['status', '==', 'Available']]);
          
          if (args.location) {
             const loc = String(args.location).toLowerCase();
             properties = properties.filter((p: any) => String(p.location || '').toLowerCase().includes(loc) || String(p.title || '').toLowerCase().includes(loc));
          }
          if (args.type) {
             const type = String(args.type).toLowerCase();
             properties = properties.filter((p: any) => String(p.type || '').toLowerCase() === type);
          }
          if (args.maxBudget && typeof args.maxBudget === 'number') {
             properties = properties.filter((p: any) => (p.price || 0) <= (args as any).maxBudget);          }

          return {
            resultsFound: properties.length,
            properties: properties.slice(0, 5).map((p: any) => ({
                id: p.id,
                title: p.title,
                price: p.price,
                location: p.location,
                type: p.type
            }))
          };
        }

        case 'schedule_viewing': {
          const viewingId = await saveEntity(orgId, 'viewings', {
             propertyId: args.propertyId,
             clientName: args.clientName,
             clientPhone: args.clientPhone,
             date: args.date,
             time: args.time,
             status: 'scheduled'
          });

          return {
            success: true,
            viewingId: viewingId,
            message: `Viewing scheduled successfully for ${args.clientName} on ${args.date} at ${args.time}.`
          };
        }

        default:
          return null;
      }
    }
  };
}
