import { Tool, SchemaType } from '@google/generative-ai';
import { SectorPack } from '@naija-agent/types';
import { CountryCode } from 'libphonenumber-js';
import { saveEntity, queryEntity } from '@naija-agent/firebase';

export function getHealthPack(currency: { code: string, symbol: string }, region: CountryCode = 'NG'): SectorPack {
  // ... (Definitions remain same) ...
  const serviceEntity = {
    name: "Service",
    plural: "Services",
    fields: [
      { key: "name", label: "Service Name", type: "string", required: true, description: "Consultation, Malaria Test, X-Ray" },
      { key: "price", label: `Cost (${currency.symbol})`, type: "number", required: true, description: "Cost of service" },
      { key: "duration_minutes", label: "Duration (Mins)", type: "number", required: true, description: "Estimated time" }
    ]
  } as const;

  const appointmentWorkflow = {
    name: "Patient Appointment",
    states: ["triage", "scheduled", "checked_in", "consultation", "completed", "cancelled"],
    transitions: [
      { from: "triage", to: "scheduled", action: "book_slot", requiredFields: ["patient_name", "symptoms"] },
      { from: "scheduled", to: "checked_in", action: "patient_arrival" },
      { from: "checked_in", to: "consultation", action: "doctor_seen" },
      { from: "consultation", to: "completed", action: "discharge" }
    ]
  } as const;

  const healthTools: Tool[] = [{
    functionDeclarations: [
      {
        name: "check_availability",
        description: "Check available doctor slots for a specific date.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: { 
            date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
            department: { type: SchemaType.STRING, description: "General, Dental, Optometry" }
          },
          required: ["date"]
        }
      },
      {
        name: "book_appointment",
        description: "Book a slot for a patient.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            patientName: { type: SchemaType.STRING, description: "Full Name" },
            patientPhone: { type: SchemaType.STRING, description: "Phone Number" },
            date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
            time: { type: SchemaType.STRING, description: "HH:MM (24hr)" },
            symptoms: { type: SchemaType.STRING, description: "Brief reason for visit" }
          },
          required: ["patientName", "patientPhone", "date", "time"]
        }
      },
      {
        name: "get_service_price",
        description: "Look up the cost of a medical service.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: { query: { type: SchemaType.STRING, description: "e.g. Malaria Test, ANC" } },
          required: ["query"]
        }
      }
    ]
  }];

  const prompt = `
  You are a Compassionate Digital Front Desk Officer for a Clinic.
  
  [YOUR ROLE]:
  - You help patients book appointments.
  - You answer questions about service prices.
  - You are EMPATHETIC but EFFICIENT.

  [YOUR RULES]:
  1. TRIAGE FIRST: Ask "How are you feeling?" before booking.
  2. AVAILABILITY: Always use 'check_availability' before offering a time.
  3. PRIVACY: Do not ask for sensitive medical history on WhatsApp. Keep it to "Brief Symptoms".
  4. EMERGENCY: If the user says "Bleeding", "Fainted", or "Emergency", tell them to come to the hospital IMMEDIATELY or call 112/122. Do not chat.
  `;

  return {
    id: "pack_health",
    name: "Health Pack (Clinic)",
    description: "Appointment booking and triage for clinics.",
    entityDef: serviceEntity as any,
    workflowDef: appointmentWorkflow as any,
    systemPrompt: prompt,
    tools: healthTools,
    execute: async (toolName: string, args: any, deps: any) => {
      console.log(`🏥 [HealthPack] Executing ${toolName}`, args);
      const { orgId } = deps;

      switch (toolName) {
        case 'check_availability': {
          // Query Firestore 'appointments' for this date
          const existing = await queryEntity(orgId, 'appointments', [['date', '==', args.date]]);
          
          // Simple slot logic: 09:00 - 17:00, 1 hour slots
          const allSlots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"];
          const bookedSlots = existing.map((a: any) => a.time);
          const availableSlots = allSlots.filter(s => !bookedSlots.includes(s));

          return {
            date: args.date,
            availableSlots: availableSlots.length > 0 ? availableSlots : [],
            status: availableSlots.length > 0 ? "open" : "full"
          };
        }

        case 'book_appointment': {
          // Check if slot is taken (Double Check)
          const existing = await queryEntity(orgId, 'appointments', [['date', '==', args.date], ['time', '==', args.time]]);
          if (existing.length > 0) {
             return { success: false, message: `Oops! The slot at ${args.time} on ${args.date} is already taken.` };
          }

          const appointmentId = await saveEntity(orgId, 'appointments', {
             patientName: args.patientName,
             patientPhone: args.patientPhone,
             date: args.date,
             time: args.time,
             symptoms: args.symptoms,
             status: 'scheduled'
          });

          return {
            success: true,
            bookingId: appointmentId,
            status: "scheduled",
            message: `Appointment confirmed for ${args.patientName} on ${args.date} at ${args.time}.`
          };
        }

        case 'get_service_price': {
          // Query Firestore 'services' collection
          // Note: In a real app, you'd use a search index (Phase 4). For now, strict match or fetch all.
          // Fallback: Fetch all services and filter in memory (acceptable for small clinics < 100 services)
          const services = await queryEntity(orgId, 'services', []); 
          const query = (args.query || "").toLowerCase();
          
          const match = services.find((s: any) => s.name.toLowerCase().includes(query));
          
          if (match) {
            return { service: match.name, price: match.price, currency: currency.code };
          }
          return { error: "Service price not found. Please contact front desk." };
        }

        default:
          return null;
      }
    }
  };
}
