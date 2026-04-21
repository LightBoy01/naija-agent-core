import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const modelName = 'gemini-3.1-flash-lite-preview';
const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelName}:generateContent?key=${apiKey}`;

async function testGlobalWebSearch() {
  console.log(`Testing Global Endpoint Web Search with model: ${modelName}...`);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ 
            text: "What is the official exchange rate of Naira to Dollar right now?" 
          }]
        }],
        tools: [{ googleSearch: {} }]
      })
    });

    console.log("Status:", response.status);
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Vertex API Error: ${response.status} - ${errorBody}`);
      return;
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("✅ SUCCESS!");
    console.log("Response:", text);
    
    // Check if grounding metadata (search results) is present
    const groundingMetadata = data.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata) {
        console.log("\n🔍 Search was used! Grounding Metadata found.");
    }
  } catch (error: any) {
    console.error("❌ FAILED:", error.message);
  }
}

testGlobalWebSearch();
