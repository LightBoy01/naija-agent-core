const https = require('https');

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = '2f38ca44-d4e9-4168-b50e-af8ef6d0e5bc';
const ENDPOINT = 'https://backboard.railway.com/graphql/v2';

if (!TOKEN) {
  console.error("❌ Error: RAILWAY_TOKEN is not set.");
  process.exit(1);
}

function queryGraphQL(query) {
  return new Promise((resolve, reject) => {
    const req = https.request(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Termux-Node-Bridge'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errors) reject(json.errors);
          else resolve(json.data);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query }));
    req.end();
  });
}

const DOMAIN_QUERY = `
  query {
    project(id: "${PROJECT_ID}") {
      name
      services {
        edges {
          node {
            id
            name
            deployments(first: 1) {
              edges {
                node {
                  id
                  url
                  status
                }
              }
            }
          }
        }
      }
    }
  }
`;

async function main() {
  try {
    const data = await queryGraphQL(DOMAIN_QUERY);
    const services = data.project.services.edges;

    console.log(`\n🌍 Railway Domains for Project: ${data.project.name || 'Unknown'}\n`);

    services.forEach(edge => {
      const service = edge.node;
      const deployments = service.deployments.edges;

      if (deployments.length > 0) {
        const deployment = deployments[0].node;
        if (deployment.url) {
            console.log(`✅ Service: ${service.name}`);
            console.log(`🔗 Domain: https://${deployment.url}`);
            if (service.name.includes('api')) {
                console.log(`\n👉 THIS IS YOUR WEBHOOK URL: https://${deployment.url}/webhook`);
                console.log(`   Verify Token: naija_verify_2026\n`);
            }
        } else {
            console.log(`⚠️ Service: ${service.name} (No public URL found for latest deployment)`);
        }
      }
    });

  } catch (error) {
    console.error("❌ Error:", JSON.stringify(error, null, 2));
  }
}

main();
