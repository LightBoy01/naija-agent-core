import { db } from '../packages/firebase/src/db.js';

// Hardcoded EntityDefinitions based on SectorPacks
const packs: Record<string, any> = {
  'commerce': {
    name: "Product",
    plural: "Products",
    fields: [
      { key: "name", label: "Product Name", type: "string", required: true, description: "The name of the item." },
      { key: "price", label: "Price", type: "number", required: true, description: "The selling price." },
      { key: "stock", label: "Available Stock", type: "number", required: true, description: "Quantity on hand." },
      { key: "image", label: "Photo", type: "image", required: false, description: "Product image." }
    ]
  },
  'health': {
    name: "Patient",
    plural: "Patients",
    fields: [
      { key: "name", label: "Patient Name", type: "string", required: true },
      { key: "age", label: "Age", type: "number", required: true },
      { key: "history", label: "Medical History", type: "string", required: false }
    ]
  },
  'legal': {
    name: "Case",
    plural: "Cases",
    fields: [
      { key: "title", label: "Case Title", type: "string", required: true },
      { key: "client", label: "Client Name", type: "string", required: true },
      { key: "status", label: "Status", type: "string", required: true }
    ]
  }
};

async function migrate() {
  console.log("🚀 Starting EntityDefinition Migration...");
  const orgsRef = db.collection('organizations');
  const snapshot = await orgsRef.get();
  
  let updatedCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const sector = data.sector || 'commerce';
    
    const entityDef = packs[sector] || packs['commerce'];
    
    await orgsRef.doc(doc.id).update({
      entityDef: entityDef
    });
    
    console.log(`✅ Updated Org ${doc.id} (${data.name}) with sector: ${sector}`);
    updatedCount++;
  }

  console.log(`🎉 Migration Complete. Updated ${updatedCount} organizations.`);
}

migrate().catch(console.error);