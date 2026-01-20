const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 4000;
const activated = new Set();

app.post('/activate', (req, res) => {
  const { serial } = req.body || {};
  if (!serial) return res.status(400).json({ error: 'serial required' });
  // mark as activated (in-memory)
  activated.add(serial);
  return res.json({ serial, activated: true });
});

app.get('/status/:serial', (req, res) => {
  const serial = req.params.serial;
  return res.json({ serial, activated: activated.has(serial) });
});

app.listen(port, () => {
  console.log(`Activation server listening on port ${port}`);
});
