import axios from 'axios';

const KEY = process.argv[2];
const MODEL = process.argv[3] || 'gemini-2.5-pro';

async function testVertexKey() {
  if (!KEY) {
    console.error("Usage: npx tsx scripts/test-vertex-key.ts <KEY> <MODEL>");
    process.exit(1);
  }

  console.log(`🧪 [TEST] Testing model: ${MODEL}`);
  console.log(`🌐 [ENDPOINT] Using Global Generative Language Endpoint...`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  try {
    // Attempt 1: As a standard API Key (Query Param)
    console.log("尝试 1: Using as API Key query parameter...");
    try {
      const res = await axios.post(`${url}?key=${KEY}`, {
        contents: [{ parts: [{ text: "hi" }] }]
      });
      console.log("✅ [SUCCESS] Valid as API Key!");
      console.log("Response:", res.data.candidates[0].content.parts[0].text);
      return;
    } catch (e: any) {
      console.log(`❌ Query param failed: ${e.response?.data?.error?.message || e.message}`);
    }

    // Attempt 2: As a Bearer Token (Authorization Header)
    console.log("\n尝试 2: Using as Bearer Token (Authorization: Bearer)...");
    try {
      const res = await axios.post(url, {
        contents: [{ parts: [{ text: "hi" }] }]
      }, {
        headers: {
          'Authorization': `Bearer ${KEY}`,
          'Content-Type': 'application/json'
        }
      });
      console.log("✅ [SUCCESS] Valid as Bearer Token!");
      console.log("Response:", res.data.candidates[0].content.parts[0].text);
    } catch (e: any) {
      console.log(`❌ Bearer token failed: ${e.response?.data?.error?.message || e.message}`);
    }

  } catch (globalError: any) {
    console.error("\n💥 [CRITICAL] Both attempts failed.");
  }
}

testVertexKey();
