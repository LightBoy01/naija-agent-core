const https = require('https');

const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = '2f38ca44-d4e9-4168-b50e-af8ef6d0e5bc';
const ENDPOINT = 'https://backboard.railway.com/graphql/v2';

if (!TOKEN) {
  console.error("❌ Error: RAILWAY_TOKEN is not set.");
  process.exit(1);
}

// Helper to run a query
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

// 1. Query Project + Deployments (detailed)
const PROJECT_QUERY = `
  query {
    project(id: "${PROJECT_ID}") {
      name
      services {
        edges {
          node {
            id
            name
          }
        }
      }
      deployments(first: 5) {
        edges {
          node {
            id
            status
            staticUrl
            createdAt
          }
        }
      }
    }
  }
`;

// 2. Query Logs for Deployment
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
    console.log(`🔍 Fetching details for project: ${PROJECT_ID}...`);
    
    const data = await queryGraphQL(PROJECT_QUERY);
    const project = data.project;

    if (!project) {
      console.error("❌ Project not found.");
      return;
    }

    console.log(`✅ Project: ${project.name}`);
    
    // List Services
    console.log("🛠️  Services:");
    project.services.edges.forEach(edge => {
        console.log(`   - ${edge.node.name} (${edge.node.id})`);
    });

    // Fetch logs for the latest deployment
    const latestDeployment = project.deployments.edges[0]?.node;
    if (latestDeployment) {
        console.log(`🚀 Latest Deployment: ${latestDeployment.status} (${latestDeployment.id})`);
        await fetchAndPrintLogs(latestDeployment.id);
    }

    // Also check the one before that if the latest has no logs
    const prevDeployment = project.deployments.edges[1]?.node;
    if (prevDeployment) {
        console.log("\n" + "-".repeat(40));
        console.log(`🔙 Previous Deployment: ${prevDeployment.status} (${prevDeployment.id})`);
        await fetchAndPrintLogs(prevDeployment.id);
    }

  } catch (error) {
    console.error("❌ Unexpected Error:", error);
  }
}

async function fetchAndPrintLogs(deploymentId) {
    console.log(`📜 Fetching Logs for ${deploymentId}...`);
    try {
        const logsData = await queryGraphQL(LOGS_QUERY(deploymentId));
        if (logsData.deploymentLogs && logsData.deploymentLogs.length > 0) {
          const sortedLogs = logsData.deploymentLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          sortedLogs.forEach(log => {
             const time = new Date(log.timestamp).toLocaleTimeString();
             console.log(`[${time}] ${log.message}`);
          });
        } else {
          console.log("No logs available.");
        }
    } catch (logError) {
        console.error("❌ Failed to fetch logs:", JSON.stringify(logError, null, 2));
    }
}

main();
