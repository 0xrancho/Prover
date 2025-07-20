// Airtable API integration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;

const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_NAME}`;

// Create a new prospect record
export async function createProspect(prospectData) {
  try {
    const response = await fetch(AIRTABLE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: prospectData
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Airtable error details:', errorText);
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error creating prospect:', error);
    throw error;
  }
}

// Search prospects
export async function searchProspects(filters = {}) {
  try {
    const response = await fetch(AIRTABLE_API_URL, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status}`);
    }

    const result = await response.json();
    return result.records;
  } catch (error) {
    console.error('Error searching prospects:', error);
    throw error;
  }
}
// Check if prospect already exists
export async function findExistingProspect(companyName) {
  try {
    const filterFormula = `{company} = "${companyName}"`;
    const url = `${AIRTABLE_API_URL}?filterByFormula=${encodeURIComponent(filterFormula)}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status}`);
    }

    const result = await response.json();
    return result.records.length > 0 ? result.records[0] : null;
  } catch (error) {
    console.error('Error finding existing prospect:', error);
    return null;
  }
}

// Update existing prospect
export async function updateProspect(recordId, prospectData) {
  try {
    const response = await fetch(`${AIRTABLE_API_URL}/${recordId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: prospectData
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error updating prospect:', error);
    throw error;
  }
}