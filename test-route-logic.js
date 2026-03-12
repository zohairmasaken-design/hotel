const { streamText } = require('ai');
const { google } = require('@ai-sdk/google');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

// Helper function to convert UI messages to Core messages
function convertToCoreMessages(messages) {
  return messages
    .filter((m) => ['user', 'assistant', 'system'].includes(m.role) && m.content && typeof m.content === 'string')
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));
}

async function testRouteLogic() {
  try {
    const incomingMessages = [
      { id: '1', role: 'user', content: 'Hello', createdAt: new Date() },
      { id: '2', role: 'assistant', content: 'Hi there', createdAt: new Date() },
      { id: '3', role: 'user', content: 'How are you?', createdAt: new Date() }
    ];

    const coreMessages = convertToCoreMessages(incomingMessages);
    console.log('Converted messages:', JSON.stringify(coreMessages, null, 2));

    if (coreMessages.length === 0) {
      console.error('No valid messages found');
      return;
    }

    console.log('Testing gemini-flash-latest...');
    const result = await streamText({
      model: google('gemini-flash-latest'),
      system: 'You are a helpful assistant.',
      messages: coreMessages,
    });

    console.log('Stream started.');
    let text = '';
    for await (const chunk of result.textStream) {
      text += chunk;
      process.stdout.write(chunk);
    }
    console.log('\nFull response:', text);
    console.log('Test passed.');
  } catch (error) {
    console.error('Test failed:', error);
    if (error.responseBody) {
        console.error('Response Body:', error.responseBody);
    }
  }
}

testRouteLogic();
