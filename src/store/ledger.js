const KEY = "daftar_ledger_v1";

function read() {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function listTxByCustomer(customerId) {
  const all = read().filter((t) => t.customerId === customerId);
  // ترتيب من الأحدث للأقدم
  return all.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function addDebt({ customerId, amount, reason, date }) {
  const list = read();
  const tx = {
    id: crypto.randomUUID(),
    customerId,
    type: "debt",
    amount: Number(amount || 0),
    reason: (reason || "").trim(),
    date: date || new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    createdAt: new Date().toISOString(),
  };
  list.unshift(tx);
  write(list);
  return tx;
}

export function addPayment({ customerId, amount, note, date }) {
  const list = read();
  const tx = {
    id: crypto.randomUUID(),
    customerId,
    type: "payment",
    amount: Number(amount || 0),
    note: (note || "").trim(),
    date: date || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  list.unshift(tx);
  write(list);
  return tx;
}

export function removeTx(id) {
  write(read().filter((t) => t.id !== id));
}

export function updateTx(id, patch) {
  const list = read();
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const existing = list[idx];
  const updated = {
    ...existing,
    ...patch,
  };
  list.splice(idx, 1, updated);
  write(list);
  return updated;
}

export function calcSummary(customerId) {
  const txs = listTxByCustomer(customerId);

  let totalDebt = 0;
  let totalPay = 0;

  for (const t of txs) {
    if (t.type === "debt") totalDebt += Number(t.amount || 0);
    if (t.type === "payment") totalPay += Number(t.amount || 0);
  }

  const balance = totalDebt - totalPay;
  return { totalDebt, totalPay, balance, count: txs.length };
}