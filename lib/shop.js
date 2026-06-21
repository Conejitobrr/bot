'use strict';

const fs = require('fs');
const path = require('path');

const SHOP_PATH = path.join(process.cwd(), 'lib', 'shop_inventory.json');

function ensureDB() {
  const dir = path.dirname(SHOP_PATH);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(SHOP_PATH)) {
    fs.writeFileSync(SHOP_PATH, JSON.stringify({}, null, 2));
  }
}

function loadDB() {
  ensureDB();

  try {
    return JSON.parse(fs.readFileSync(SHOP_PATH, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function saveDB(data) {
  ensureDB();
  fs.writeFileSync(SHOP_PATH, JSON.stringify(data, null, 2));
}

function cleanJid(jid = '') {
  return String(jid).split(':')[0];
}

function defaultInventory() {
  return {
    verUses: 0,
    spotifyUses: 0,
    keys: 0
  };
}

async function getInventory(jid) {
  const user = cleanJid(jid);
  const data = loadDB();

  if (!data[user]) {
    data[user] = defaultInventory();
    saveDB(data);
  } else {
    data[user] = {
      ...defaultInventory(),
      ...data[user]
    };
  }

  return data[user];
}

async function setInventory(jid, inventory = {}) {
  const user = cleanJid(jid);
  const data = loadDB();

  data[user] = {
    ...defaultInventory(),
    ...inventory
  };

  saveDB(data);

  return data[user];
}

async function getItem(jid, item) {
  const inv = await getInventory(jid);
  return Number(inv[item] || 0);
}

async function addItem(jid, item, amount = 1) {
  const inv = await getInventory(jid);
  const value = Math.max(1, Number(amount) || 1);

  inv[item] = Number(inv[item] || 0) + value;

  return await setInventory(jid, inv);
}

async function useItem(jid, item, amount = 1) {
  const inv = await getInventory(jid);
  const value = Math.max(1, Number(amount) || 1);

  if (Number(inv[item] || 0) < value) {
    return false;
  }

  inv[item] = Number(inv[item] || 0) - value;

  await setInventory(jid, inv);
  return true;
}

module.exports = {
  getInventory,
  setInventory,
  getItem,
  addItem,
  useItem
};
