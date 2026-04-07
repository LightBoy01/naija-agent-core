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
        console.log('--- Available Gemini 3.1 Models ---');
        if (!json.models) {
           console.log('No models found. Response:', data);
           return;
        }
        json.models.forEach(m => {
          if (m.name.includes('3.1')) {
            console.log(m.name.replace('models/', '') + ' (' + m.displayName + ')');
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
