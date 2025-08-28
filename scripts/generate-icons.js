const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconSizes = [
  16, 32, 72, 96, 128, 144, 152, 192, 384, 512
];

async function generateIcons() {
  console.log('🎬 Generating PWA icons...');
  
  // Ensure the public directory exists
  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  try {
    // Read the base SVG icon
    const svgPath = path.join(publicDir, 'icon.svg');
    if (!fs.existsSync(svgPath)) {
      console.error('❌ Base icon.svg not found in public directory');
      return;
    }
    
    // Generate icons for each size
    for (const size of iconSizes) {
      const outputPath = path.join(publicDir, `icon-${size}x${size}.png`);
      
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated icon-${size}x${size}.png`);
    }
    
    console.log('🎉 All PWA icons generated successfully!');
    console.log('📱 Your app is now ready for PWA installation');
    
  } catch (error) {
    console.error('❌ Error generating icons:', error);
  }
}

generateIcons();
