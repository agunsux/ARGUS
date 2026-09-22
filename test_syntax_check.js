const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getAllJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

const srcFiles = getAllJsFiles(path.join(__dirname, 'src'));
console.log(`Checking syntax for ${srcFiles.length} files in src/ ...`);

let errorCount = 0;
for (const file of srcFiles) {
  try {
    execSync(`node -c "${file}"`, { stdio: 'pipe' });
  } catch (err) {
    console.error(`❌ Syntax error in: ${file}`);
    errorCount++;
  }
}

if (errorCount === 0) {
  console.log(`✅ All ${srcFiles.length} src/ JS files passed syntax validation!`);
  process.exit(0);
} else {
  console.error(`❌ ${errorCount} files failed syntax check!`);
  process.exit(1);
}
