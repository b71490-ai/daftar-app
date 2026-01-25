const schedule = require('node-schedule');
const { exec } = require('child_process');
const path = require('path');

function startBackupScheduler() {
  // schedule daily at midnight server time
  const job = schedule.scheduleJob('0 0 * * *', () => {
    const script = path.join(__dirname, 'scripts', 'backup.js');
    exec(`node ${script}`, { cwd: __dirname }, (err, stdout, stderr) => {
      if (err) console.error('Backup job error', err);
      else console.log('Backup job output', stdout.trim());
    });
  });
  console.log('📦 Backup scheduler registered (daily at 00:00)');
  return job;
}

module.exports = { startBackupScheduler };
