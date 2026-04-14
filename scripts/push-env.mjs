import fs from 'fs';
import { execSync } from 'child_process';

const envRaw = fs.readFileSync('.env', 'utf-8');
const lines = envRaw.split('\n');

const envObj = {};

for (const line of lines) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        let key = match[1].trim();
        let value = match[2].trim();
        // Remove surrounding quotes if any
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        envObj[key] = value;
    }
}

// Ensure NODE_ENV is production
envObj['NODE_ENV'] = 'production';

// Fetch the current REDIS_URL from Northflank to fix the incorrect URI string
try {
    const stdout = execSync('northflank get service runtime-environment --projectId naija-agent-core --serviceId naija-agent-api -o json', { encoding: 'utf-8' });
    const currentEnv = JSON.parse(stdout);
    let redisUrl = currentEnv.runtimeEnvironment.REDIS_URL;
    
    if (redisUrl && redisUrl.includes('redis-cli')) {
        const match = redisUrl.match(/(rediss?:\/\/[^\s]+)/);
        if (match) {
            envObj['REDIS_URL'] = match[1];
            console.log('Fixed REDIS_URL from Northflank CLI string to standard URI.');
        }
    }
} catch (e) {
    console.error('Failed to get current REDIS_URL', e.message);
}

const payload = {
    runtimeEnvironment: envObj,
    runtimeFiles: {}
};

fs.writeFileSync('nf-env.json', JSON.stringify(payload, null, 2));

console.log('Pushing environment variables to naija-agent-workers...');
try {
    execSync('northflank update service runtime-environment --projectId naija-agent-core --serviceId naija-agent-workers -f nf-env.json', { stdio: 'inherit' });
    console.log('Successfully pushed .env to Northflank Workers!');
} catch (e) {
    console.error('Failed to push environment variables:', e.message);
}
