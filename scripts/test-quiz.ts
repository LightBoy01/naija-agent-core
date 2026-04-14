import { studyBuddy } from '../apps/worker-life/src/services/studyBuddy.js';
import dotenv from 'dotenv';
dotenv.config();

console.log("Key:", process.env.GEMINI_API_KEY ? "EXISTS" : "MISSING");
studyBuddy.generateQuiz('Math', 'Algebra', 'SS3').then(console.log).catch(console.error);
