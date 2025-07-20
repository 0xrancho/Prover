const AIRTABLE_API_KEY = 'patVyoqg0sxtlwAvb.baf2e348091bbf687964612d858c36b679202f3d6dde6ae50f469c809117924f';
const AIRTABLE_BASE_ID = 'appg6s1XqDXNKeJVS';
const AIRTABLE_TABLE_NAME = 'tbl77cmms8ZfkUhoz';

const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;

async function testConnection() {
  try {
    console.log('Testing URL:', AIRTABLE_API_URL);
    
    const response = await fetch(AIRTABLE_API_URL, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      }
    });
    
    console.log('Status:', response.status);
    
    const result = await response.text();
    console.log('Response:', result);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testConnection();
