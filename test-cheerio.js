// Simple test to check if cheerio works
try {
  const cheerio = require('cheerio');
  console.log('✅ Cheerio loaded successfully');
  console.log('Cheerio version:', require('./package.json').dependencies.cheerio);
} catch (error) {
  console.error('❌ Cheerio failed to load:', error.message);
  console.error('Full error:', error);
}
