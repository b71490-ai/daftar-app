const path = require('path');
module.exports = {
  targets: {
    licenseExport: { sql: `SELECT * FROM License;`, out: path.join(__dirname, 'backups', 'licenses.json') },
    userExport: { sql: `SELECT * FROM User;`, out: path.join(__dirname, 'backups', 'users.json') },
    activityLog: path.join(__dirname, 'activity.log'),
    configFile: path.join(__dirname, 'config.js'),
  },
  outDir: path.join(__dirname, 'backups'),
  retention: { daily: 7, weekly: 4, monthly: 3 },
  s3: {
    bucket: process.env.BACKUP_S3_BUCKET || null,
    region: process.env.BACKUP_S3_REGION || null,
    accessKeyId: process.env.BACKUP_S3_KEY || null,
    secretAccessKey: process.env.BACKUP_S3_SECRET || null,
    endpoint: process.env.BACKUP_S3_ENDPOINT || null
  },
  // enable encryption of archives; set BACKUP_ENCRYPT=true and provide BACKUP_PASSPHRASE env var
  encrypt: process.env.BACKUP_ENCRYPT === 'true' || false
};
