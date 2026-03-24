const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://mmgcaadogqjtzumwmyec.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tZ2NhYWRvZ3FqdHp1bXdteWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5ODMzMjMsImV4cCI6MjA4OTU1OTMyM30.Uw2J_iN66dnqNsbSjcGXFLz88r7kRQDLBYBybm7NRcs';

async function testAgent() {
  const url = `${supabaseUrl}/functions/v1/test-agent`;
  console.log('Post:', url);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Oi! Me explica o que você vende e como funciona por favor, tenho interesse.' }],
      language: 'pt-BR'
    })
  });

  const text = await response.text();
  console.log('AI Response:', text);
}

testAgent().catch(console.error);
