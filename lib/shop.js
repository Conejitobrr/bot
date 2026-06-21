'use strict';

const fs = require('fs').promises; // Usamos la versión asíncrona
const path = require('path');
const config = require('../config');

const SHOP_PATH = path.join(process.cwd(), 'lib', 'shop_inventory.json');

// 🔥 CACHÉ EN RAM (Carga el archivo 1 sola vez)
let shopCache = null;
let isDirty = false;

async function loadDB() {
  if (shopCache) return shopCache;
  try {
    const data = await fs.readFile(SHOP_PATH, 'utf8');
    shopCache = JSON.parse(data);
  } catch {
    shopCache = {}; // Si no existe, inicia vacío
  }
  return shopCache;
}

// 💾 GUARDADO ASÍNCRONO (No bloquea al bot)
async function saveDB() {
  if (!isDirty) return;
  await fs.writeFile(SHOP_PATH, JSON.stringify(shopCache, null, 2));
  isDirty = false;
}

// Auto-guardado cada 30 segundos
setInterval(saveDB, 30000);

function cleanJid(jid = '') { return String(jid).split(':')[0]; }

// ─────────────────────────────────────────
// ⚡ OPERACIONES (Dinámicas)
// ─────────────────────────────────────────
async function getInventory(jid) {
  const user = cleanJid(jid);
  const cache = await loadDB();
  return cache[user] || {}; // Retorna vacío si no tiene nada
}

async function addItem(jid, item, amount = 1) {
  const user = cleanJid(jid);
  const cache = await loadDB();
  
  if (!cache[user]) cache[user] = {};
  cache[user][item] = (cache[user][item] || 0) + Math.max(1, amount);
  
  isDirty = true;
  return cache[user];
}

async function useItem(jid, item, amount = 1) {
  const user = cleanJid(jid);
  const cache = await loadDB();
  
  if (!cache[user] || (cache[user][item] || 0) < amount) return false;

  cache[user][item] -= amount;
  isDirty = true;
  return true;
}

module.exports = {
  getInventory,
  getItem: async (jid, item) => (await getInventory(jid))[item] || 0,
  addItem,
  useItem
};
