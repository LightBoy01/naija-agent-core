import { getDb as getFirestore } from './packages/firebase/dist/index.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkChats() {
  const firestore = getFirestore();
  
  const masterChats = await firestore.collection('chats').where('organizationId', '==', 'naija-agent-master').get();
  console.log(`naija-agent-master chats: ${masterChats.size}`);

  const zynuxChats = await firestore.collection('chats').where('organizationId', '==', 'zynux').get();
  console.log(`zynux chats: ${zynuxChats.size}`);

  const aelixxrChats = await firestore.collection('chats').where('organizationId', '==', 'aelixxr').get();
  console.log(`aelixxr chats: ${aelixxrChats.size}`);

  const aelixxrLifeChats = await firestore.collection('chats').where('organizationId', '==', 'aelixxr-life-companion').get();
  console.log(`aelixxr-life-companion chats: ${aelixxrLifeChats.size}`);

  process.exit(0);
}
checkChats().catch(console.error);
