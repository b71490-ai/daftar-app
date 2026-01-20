const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const lic = process.env.LICENSE_KEY;
if (!lic) { console.log("NO_LICENSE_IN_ENV"); process.exit(1); }

const [prefix, payload, sig] = lic.trim().split('.');
console.log("prefix:", prefix);

function b64urlToBuf(s){
  const b64 = s.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((s.length+3)%4);
  return Buffer.from(b64,'base64');
}

const publicPem = fs.readFileSync(path.join(__dirname,'keys','public.pem'),'utf8');
const verifier = crypto.createVerify('RSA-SHA256');
verifier.update(payload, 'utf8');
verifier.end();

console.log("signature valid?", verifier.verify(publicPem, b64urlToBuf(sig)));
