const app = require('./app');
const config = require('./config');
const connectDB = require('./config/database');
const { initScheduler } = require('./utils/scheduler');

connectDB().then(() => {
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
    initScheduler();
  });
});