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

const SERVICE_QUERY = `
  query {
    project(id: "${PROJECT_ID}") {
      name
      services {
        edges {
          node {
            id
            name
            deployments(first: 3) {
              edges {
                node {
                  id
                  status
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  }
`;

const LOGS_QUERY = (deploymentId) => `
  query {
    deploymentLogs(deploymentId: "${deploymentId}") {
      message
      severity
      timestamp
    }
  }
`;

async function main() {
  try {
    const data = await queryGraphQL(SERVICE_QUERY);
    const services = data.project.services.edges;

    for (const serviceEdge of services) {
      const service = serviceEdge.node;
      console.log(`\n🛠️  Service: ${service.name} (${service.id})`);
      
      const deployments = service.deployments.edges;
      if (deployments.length === 0) {
        console.log("No deployments found.");
        continue;
      }

      for (const depEdge of deployments) {
        const dep = depEdge.node;
        console.log(`🚀 Deployment: ${dep.status} (${dep.id}) - ${dep.createdAt}`);
        
        if (dep.status === 'CRASHED' || dep.status === 'REMOVED' || dep.status === 'FAILED') {
           // Skip old failed ones unless it's the latest
           if (depEdge === deployments[0]) {
             await fetchAndPrintLogs(dep.id);
           }
        } else if (dep.status === 'BUILDING' || dep.status === 'DEPLOYING' || dep.status === 'SUCCESS') {
           await fetchAndPrintLogs(dep.id);
        }
      }
    }
  } catch (error) {
    console.error("❌ Error:", JSON.stringify(error, null, 2));
  }
}

async function fetchAndPrintLogs(deploymentId) {
    console.log(`📜 Logs for ${deploymentId}:`);
    const logsData = await queryGraphQL(LOGS_QUERY(deploymentId));
    if (logsData.deploymentLogs?.length > 0) {
       logsData.deploymentLogs.slice(-50).forEach(log => {
         console.log(`[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`);
       });
    } else {
      console.log("No logs available.");
    }
}

main();
