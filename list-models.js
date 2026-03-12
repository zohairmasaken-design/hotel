const https = require('https');
const apiKey = 'AIzaSyDlOr2hv_0cmdBtZN58hW-Sm7RH7lxXJZE';

function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`;
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.models) {
          console.log('Available Models:');
          json.models.forEach(m => {
             if (m.name.includes('gemini')) {
                 console.log(`- ${m.name}`);
             }
          });
        } else {
            console.log('No models found or error:', json);
        }
      } catch (e) {
        console.error('Error parsing JSON:', e);
        console.log('Raw data:', data);
      }
    });
  }).on('error', (err) => {
    console.error('Error:', err);
  });
}

listModels();
