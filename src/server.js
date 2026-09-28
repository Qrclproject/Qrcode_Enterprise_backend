// src/server.js
const { execSync } = require('child_process');
const app = require('./app');
const config = require('./config');
const connectDB = require('./config/database');
const { initScheduler } = require('./utils/scheduler');

// ─── Log available font families on boot ─────────────────────────
// Helps confirm that fonts-liberation / fonts-dejavu-* were correctly
// installed by nixpacks.toml. If this list is empty or missing the
// expected families, text overlays on pass images will render as
// empty boxes ("tofu") instead of real letters.
try {
  const fonts = execSync('fc-list : family', { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.split(',')[0].trim())
    .filter(Boolean);

  const unique = [...new Set(fonts)].sort();

  if (unique.length === 0) {
    console.warn(
      '⚠️  No fonts detected on this host. Text overlays will render as boxes.\n' +
      '   Ensure nixpacks.toml installs fontconfig + fonts-liberation + fonts-dejavu-*.'
    );
  } else {
    console.log(`🖋  ${unique.length} font families available:`);
    unique.forEach((f) => console.log(`    • ${f}`));
  }
} catch (err) {
  console.warn(
    '⚠️  Could not run fc-list — fontconfig may not be installed:',
    err.message
  );
}

connectDB().then(() => {
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
    initScheduler();
  });
});
