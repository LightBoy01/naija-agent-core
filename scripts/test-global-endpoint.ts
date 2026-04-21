import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

const body = {
  contents: [{ role: "user", parts: [{ text: "Hello! Tell me a fun fact." }] }]
};

async function testGlobal() {
  console.log(`Testing global publisher endpoint...`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error("Fetch Error:", err.message);
  }
}

testGlobal();
