const fs = require('fs');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');

(async function(){
  const token = process.env.ADMIN_TEST_TOKEN;
  if (!token) {
    console.error('Please set ADMIN_TEST_TOKEN env to an admin trader id.');
    process.exit(2);
  }
  const url = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/admin/traders/export.csv` : 'http://127.0.0.1:4000/admin/traders/export.csv';
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error('Request failed', res.status, await res.text());
      process.exit(3);
    }
    const buf = await res.arrayBuffer();
    const out = path.join(__dirname, '..', 'tmp_traders_export_download.csv');
    fs.writeFileSync(out, Buffer.from(buf));
    console.log('Wrote', out);
  } catch (e) {
    console.error('Error fetching export:', e && e.message ? e.message : e);
    process.exit(4);
  }
})();
