const dotenv = require('dotenv');
const https = require('https');

dotenv.config();

function list() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;

  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (!json.models) {
           console.log('No models found. Response:', data);
           return;
        }
        json.models.forEach(m => {
          if (m.name.toLowerCase().includes('gemma')) {
             console.log(m.name);
          }
        });
      } catch (e) {
        console.error('Error parsing response:', e.message);
      }
    });
  }).on('error', (err) => {
    console.error('Request error:', err.message);
  });
}
list();
