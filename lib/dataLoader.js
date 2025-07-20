import fs from 'fs';
import path from 'path';

// Parse CSV content into array of objects
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    return obj;
  });
}

// Handle CSV parsing with proper quote handling
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// Load ICP Matrix data
export function loadICPMatrix() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'ICP_Matrix.csv');
    const csvContent = fs.readFileSync(filePath, 'utf8');
    return parseCSV(csvContent);
  } catch (error) {
    console.error('Error loading ICP Matrix:', error);
    return [];
  }
}

// Load Customer Success Stories data
export function loadCustomerSuccessStories() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'Customer_Success_Stories.csv');
    const csvContent = fs.readFileSync(filePath, 'utf8');
    return parseCSV(csvContent);
  } catch (error) {
    console.error('Error loading Customer Success Stories:', error);
    return [];
  }
}

// Find matching ICP profile for a given industry/vertical
export function findICPMatch(industry, companySize) {
  const icpData = loadICPMatrix();
  
  return icpData.find(profile => {
    const industryMatch = profile.vertical.toLowerCase().includes(industry.toLowerCase()) ||
                         industry.toLowerCase().includes(profile.vertical.toLowerCase());
    
    const sizeMatch = !companySize || profile.company_size.toLowerCase().includes(companySize.toLowerCase());
    
    return industryMatch && sizeMatch;
  });
}

// Find relevant success stories based on industry and solution fit
export function findSuccessStoryMatches(industry, painPoints = [], limit = 3) {
  const stories = loadCustomerSuccessStories();
  
  const scoredStories = stories.map(story => {
    let score = 0;
    
    // Industry match (40 points)
    if (story.industry.toLowerCase().includes(industry.toLowerCase()) ||
        industry.toLowerCase().includes(story.industry.toLowerCase())) {
      score += 40;
    }
    
    // Pain point match (30 points)
    const storyTags = story.industry_tags.toLowerCase();
    const painPointMatches = painPoints.filter(pain => 
      storyTags.includes(pain.toLowerCase()) ||
      story.solution_delivered.toLowerCase().includes(pain.toLowerCase())
    );
    score += Math.min(painPointMatches.length * 10, 30);
    
    // Company size relevance (20 points)
    if (story.company_size.includes('1000+')) score += 20;
    else if (story.company_size.includes('500+')) score += 15;
    else if (story.company_size.includes('100+')) score += 10;
    
    // Solution category bonus (10 points)
    if (story.solution_category.includes('Legacy Modernization') ||
        story.solution_category.includes('Custom Software') ||
        story.solution_category.includes('IoT Platform')) {
      score += 10;
    }
    
    return { ...story, relevance_score: score };
  });
  
  return scoredStories
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, limit);
}