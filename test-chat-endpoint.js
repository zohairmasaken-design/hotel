
async function testChatEndpoint() {
  try {
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'هلا' }
        ]
      }),
    });

    console.log('Status:', response.status);
    console.log('Headers:', response.headers);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      console.log('Chunk:', text);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testChatEndpoint();
