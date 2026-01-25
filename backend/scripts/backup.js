#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');
const AWS = require('aws-sdk');
const cfg = require('../backup.config');
const { DB_PATH } = require('../config');

async function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function exportSqlToJson(sql, outPath) {
  try {
    const dbPath = DB_PATH;
    const out = execSync(`sqlite3 -json "${dbPath}" "${sql.replace(/"/g, '\\"')}"`, { cwd: __dirname }).toString();
    fs.writeFileSync(outPath, out);
    return true;
  } catch (e) { return false; }
}

async function uploadToS3(filePath, key) {
  if (!cfg.s3.bucket) return { ok: false, reason: 'no_s3' };
  const s3 = new AWS.S3({
    accessKeyId: cfg.s3.accessKeyId,
    secretAccessKey: cfg.s3.secretAccessKey,
    region: cfg.s3.region,
    endpoint: cfg.s3.endpoint || undefined,
    s3ForcePathStyle: !!cfg.s3.endpoint,
  });
  const body = fs.createReadStream(filePath);
  await s3.upload({ Bucket: cfg.s3.bucket, Key: key, Body: body }).promise();
  return { ok: true };
}

async function run() {
  try {
    const t0 = Date.now();
    await ensureDir(cfg.outDir);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const workdir = path.join(cfg.outDir, `tmp_${timestamp}`);
    await ensureDir(workdir);

    // export license and user tables
    const licOut = path.join(workdir, 'licenses.json');
    const usersOut = path.join(workdir, 'users.json');
    exportSqlToJson(cfg.targets.licenseExport.sql, licOut);
    exportSqlToJson(cfg.targets.userExport.sql, usersOut);

    // copy activity log and add a sanitized runtime config (never include raw config with secrets)
    try { fs.copyFileSync(cfg.targets.activityLog, path.join(workdir, 'activity.log')); } catch (e) { }
    try {
      const secrets = require('../secrets');
      const publicCfg = secrets.getPublicConfig();
      fs.writeFileSync(path.join(workdir, 'config.sanitized.json'), JSON.stringify(publicCfg, null, 2));
    } catch (e) { }

    // create archive
    const archivePath = path.join(cfg.outDir, `backup_${timestamp}.tar.gz`);
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('tar', { gzip: true });
    archive.pipe(output);
    archive.directory(workdir + '/', false);
    await archive.finalize();
    // wait for output stream to finish writing the archive
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('end', resolve);
      output.on('error', reject);
    });

    // optionally encrypt archive (AES-256-GCM) if enabled
    let finalArchivePath = archivePath;
    if (cfg.encrypt) {
      try {
        const pass = process.env.BACKUP_PASSPHRASE;
        if (!pass) throw new Error('BACKUP_PASSPHRASE not set');
        const crypto = require('crypto');
        const salt = crypto.randomBytes(16);
        const key = crypto.scryptSync(pass, salt, 32);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const input = fs.readFileSync(archivePath);
        const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
        const tag = cipher.getAuthTag();
        // store: salt(16) + iv(12) + tag(16) + encrypted
        const outBuf = Buffer.concat([salt, iv, tag, encrypted]);
        const encPath = archivePath + '.enc';
        fs.writeFileSync(encPath, outBuf);
        // remove plaintext archive
        try { fs.unlinkSync(archivePath); } catch (e) { }
        finalArchivePath = encPath;
        // set file readonly and immutable (macOS chflags uchg)
        try { fs.chmodSync(finalArchivePath, 0o400); } catch (e) { }
        try { if (process.platform === 'darwin') require('child_process').execSync(`chflags uchg ${finalArchivePath}`); } catch (e) { }
      } catch (e) {
        console.error('ENCRYPT_ERROR', e && e.stack ? e.stack : e);
      }
    }

    // upload to s3 if configured (upload finalArchivePath)
    let s3res = { ok: false };
    if (cfg.s3.bucket) {
      const key = `backups/${path.basename(finalArchivePath)}`;
      s3res = await uploadToS3(finalArchivePath, key);
    }

    // cleanup tmp
    try { fs.rmSync(workdir, { recursive: true, force: true }); } catch (e) { }

    // smart rotation: keep last N daily, M weekly, K monthly; remove older
    try {
      const files = fs.readdirSync(cfg.outDir).filter(f => f.startsWith('backup_') && f.endsWith('.tar.gz'));
      // parse date from filename: backup_YYYY-MM-DD_HH-MM.tar.gz
      function parseDateFromName(name) {
        try {
          const m = name.match(/^backup_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})\.tar\.gz$/);
          if (!m) return null;
          const datePart = m[1]; const hh = m[2]; const mm = m[3];
          const [y, mo, d] = datePart.split('-').map(Number);
          return new Date(y, mo - 1, Number(d), Number(hh), Number(mm));
        } catch (e) { return null; }
      }

      const items = files.map(f => ({ name: f, date: parseDateFromName(f) })).filter(i => i.date).sort((a,b) => b.date - a.date);
      const keepDaily = (cfg.retention && cfg.retention.daily) ? Number(cfg.retention.daily) : 7;
      const keepWeekly = (cfg.retention && cfg.retention.weekly) ? Number(cfg.retention.weekly) : 4;
      const keepMonthly = (cfg.retention && cfg.retention.monthly) ? Number(cfg.retention.monthly) : 3;

      const toKeep = new Set();
      const dailySeen = new Set();
      // daily: keep most recent per day up to keepDaily days
      for (const it of items) {
        const dayKey = it.date.getFullYear() + '-' + String(it.date.getMonth()+1).padStart(2,'0') + '-' + String(it.date.getDate()).padStart(2,'0');
        if (dailySeen.size < keepDaily && !dailySeen.has(dayKey)) {
          dailySeen.add(dayKey);
          toKeep.add(it.name);
        }
      }

      // weekly: ISO week number grouping for remaining items
      function getISOWeekKey(date) {
        const tmp = new Date(date.getTime());
        // Thursday in current week decides the year.
        tmp.setHours(0,0,0,0);
        tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
        const week1 = new Date(tmp.getFullYear(),0,4);
        const weekNo = 1 + Math.round(((tmp - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
        return tmp.getFullYear() + '-W' + String(weekNo).padStart(2,'0');
      }

      const weeklySeen = new Set();
      for (const it of items) {
        if (toKeep.has(it.name)) continue;
        const wk = getISOWeekKey(it.date);
        if (weeklySeen.size < keepWeekly && !weeklySeen.has(wk)) {
          weeklySeen.add(wk);
          toKeep.add(it.name);
        }
      }

      // monthly: keep most recent per month
      const monthlySeen = new Set();
      for (const it of items) {
        if (toKeep.has(it.name)) continue;
        const mon = it.date.getFullYear() + '-' + String(it.date.getMonth()+1).padStart(2,'0');
        if (monthlySeen.size < keepMonthly && !monthlySeen.has(mon)) {
          monthlySeen.add(mon);
          toKeep.add(it.name);
        }
      }

      // delete those not in toKeep
      const toRemove = items.map(i => i.name).filter(n => !toKeep.has(n));
      toRemove.forEach(f => { try { fs.unlinkSync(path.join(cfg.outDir, f)); } catch (e) { } });
    } catch (e) { }

    // record backup result in activity.log
    try {
      const act = {
        action: 'backup',
        archive: path.basename(finalArchivePath),
        // avoid storing absolute filesystem paths or secrets in activity log
        s3: s3res.ok ? 'uploaded' : 'skipped',
        size: fs.existsSync(finalArchivePath) ? fs.statSync(finalArchivePath).size : null,
        time: new Date().toISOString(),
        result: 'success'
      };
      try { fs.appendFileSync(path.join(__dirname, '..', 'activity.log'), JSON.stringify(act) + '\n'); } catch (e) { }
    } catch (e) { }
    console.log('BACKUP_DONE', { archive: path.basename(finalArchivePath), s3: s3res.ok ? 'uploaded' : 'skipped' });
    process.exit(0);
  } catch (e) {
    console.error('BACKUP_ERROR', e && e.stack ? e.stack : e);
    process.exit(2);
  }
}

run();
