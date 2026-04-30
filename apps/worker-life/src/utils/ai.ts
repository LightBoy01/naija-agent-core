import { Message } from '@naija-agent/types';

/**
 * Normalizes chat history for Gemini API requirements:
 * 1. Strictly alternating roles (User -> Model -> User).
 * 2. Removes leading model messages.
 * 3. Merges consecutive messages from the same role.
 * 4. Ensures the final history is ready for a .sendMessage() call from the 'user'.
 */
export function normalizeHistory(history: any[]) {
    // 1. Map roles to Gemini standard
    let chatHistory = history.map((msg: any) => ({
        role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.content }],
    }));

    // 2. Remove leading model messages (Gemini requirement)
    while (chatHistory.length > 0 && chatHistory[0].role === 'model') {
        chatHistory.shift();
    }

    // 3. Ensure strictly alternating roles
    const alternatingHistory: any[] = [];
    let lastRole = null;
    for (const msg of chatHistory) {
        if (msg.role !== lastRole) {
            alternatingHistory.push(msg);
            lastRole = msg.role;
        } else {
            // Merge consecutive same-role messages
            if (alternatingHistory.length > 0) {
                alternatingHistory[alternatingHistory.length - 1].parts[0].text += "\n" + msg.parts[0].text;
            }
        }
    }

    // 4. Prepare for .sendMessage(user)
    // If the last message is from 'user', we pop it so the current message can take its place
    let lastUserMessage = "";
    if (alternatingHistory.length > 0 && alternatingHistory[alternatingHistory.length - 1].role === 'user') {
        const popped = alternatingHistory.pop();
        lastUserMessage = popped?.parts[0].text || "";
    }

    return { 
        history: alternatingHistory, 
        lastUserMessage 
    };
}
