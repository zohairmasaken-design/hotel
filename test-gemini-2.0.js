const { streamText } = require('ai');
const { google } = require('@ai-sdk/google');
const dotenv = require('dotenv');

dotenv.config({ path: '.env.local' });

async function testStream() {
  try {
    console.log('Testing gemini-flash-latest...');
    const result = await streamText({
      model: google('gemini-flash-latest'),
      messages: [{ role: 'user', content: 'Hello' }],
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
    if (error.statusCode === 429) {
        console.error('QUOTA EXCEEDED. Please enable billing or wait.');
    }
  }
}

testStream();
