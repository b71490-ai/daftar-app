const KEY = "daftar_customers_v1";

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

export function listCustomers() {
  return read();
}

export function addCustomer({ name, phone, whatsapp, notes }) {
  const list = read();

  const item = {
    id: crypto.randomUUID(),
    name: (name || "").trim(),
    phone: (phone || "").trim(),
    whatsapp: (whatsapp || "").trim(),
    notes: (notes || "").trim(),
    // subscription fields
    subscriptionStart: null,
    subscriptionEnd: null,
    subscriptionStatus: "active",
    createdAt: new Date().toISOString(),
  };

  list.unshift(item);
  write(list);
  return item;
}

export function updateCustomer(id, patch) {
  const list = read();
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return null;

  list[idx] = {
    ...list[idx],
    ...patch,
    name: (patch.name ?? list[idx].name).trim(),
    phone: (patch.phone ?? list[idx].phone).trim(),
    whatsapp: ((patch.whatsapp ?? list[idx].whatsapp) || "").trim(),
    notes: (patch.notes ?? list[idx].notes).trim(),
    subscriptionStart: (patch.subscriptionStart ?? list[idx].subscriptionStart) || null,
    subscriptionEnd: (patch.subscriptionEnd ?? list[idx].subscriptionEnd) || null,
    subscriptionStatus: (patch.subscriptionStatus ?? list[idx].subscriptionStatus) || list[idx].subscriptionStatus || "active",
    updatedAt: new Date().toISOString(),
  };

  write(list);
  return list[idx];
}

export function removeCustomer(id) {
  const list = read().filter((x) => x.id !== id);
  write(list);
}
export function getCustomer(id) {
    return read().find((x) => x.id === id) || null;
  }