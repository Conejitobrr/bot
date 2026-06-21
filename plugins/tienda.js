'use strict';

const fs = require('fs');
const path = require('path');
const shop = require('../lib/shop');

const JAIL_PATH = path.join(process.cwd(), 'lib', 'jail.json');

const ITEMS = {
  ver: { key: 'verUses', name: '🎟️ Uso de .ver', price: 10000, desc: 'Permite usar .ver 1 vez' },
  spotify: { key: 'spotifyUses', name: '🎵 Uso de .spotify', price: 1500, desc: 'Permite usar .spotify 1 vez' },
  llave: { key: 'keys', name: '🔑 Llave de celda', price: 1000, desc: 'Permite salir de la cárcel 1 vez' },
  
  // EQUIPO PRO (Ahora a 30k XP)
  cana_pro: { key: 'cana_pro', name: '🎣 Caña Profesional', price: 30000, desc: 'Pesca con mayor éxito y más XP' },
  arma_pro: { key: 'arma_pro', name: '🏹 Arco de Cacería', price: 30000, desc: 'Caza con mayor éxito y más XP' },
  pico_pro: { key: 'pico_pro', name: '⛏️ Pico de Diamante', price: 30000, desc: 'Mina con mayor éxito y más XP' },
  
  // ESPECIALES
  caja: { key: 'cajaUses', name: '📦 Caja Sorpresa XP', price: 2000, desc: 'Contiene XP aleatorio' },
  escudo: { key: 'shieldUses', name: '🛡️ Escudo Anti-Robo', price: 2500, desc: 'Te protege del próximo robo' }
};

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function cleanNumber(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }

function loadJail() {
  try {
    return JSON.parse(fs.readFileSync(JAIL_PATH, 'utf8') || '{"jailed":{}}');
  } catch { return { jailed: {} }; }
}

function saveJail(data) {
  try { fs.writeFileSync(JAIL_PATH, JSON.stringify(data, null, 2)); } catch {}
}

function shopText() {
  return (
`🛒 *TIENDA SIRIUSBOT*

🎟️ *ver* (10k XP)
🎵 *spotify* (1.5k XP)
🔑 *llave* (1k XP)
🎣 *cana_pro* (30k XP)
🏹 *arma_pro* (30k XP)
⛏️ *pico_pro* (30k XP)
📦 *caja* (2k XP)
🛡️ *escudo* (2.5k XP)

📦 Compra: *.comprar [item] [cant]*
🎒 Inventario: *.inventario*
🔓 Usar llave/caja: *.usar [item]*`
  );
}

module.exports = {
  commands: ['tienda', 'comprar', 'inventario', 'usar'],

  async execute(ctx) {
    const { sock, remoteJid, msg, sender, args, command, db } = ctx;

    try {
      const user = cleanJid(sender);

      if (command === 'tienda') {
        return sock.sendMessage(remoteJid, { text: shopText() }, { quoted: msg });
      }

      if (command === 'inventario') {
        const inv = await shop.getInventory(user);
        return sock.sendMessage(remoteJid, {
          text: `🎒 *INVENTARIO*\n\n👤 @${cleanNumber(user)}\n\n🎟️ Ver: *${inv.verUses || 0}*\n🎵 Spotify: *${inv.spotifyUses || 0}*\n🔑 Llaves: *${inv.keys || 0}*\n🎣 Cañas Pro: *${inv.cana_pro || 0}*\n🏹 Arcos: *${inv.arma_pro || 0}*\n⛏️ Picos Diam: *${inv.pico_pro || 0}*\n📦 Cajas: *${inv.cajaUses || 0}*\n🛡️ Escudos: *${inv.shieldUses || 0}*`,
          mentions: [user]
        }, { quoted: msg });
      }

      if (command === 'usar') {
        const itemKey = (args[0] || '').toLowerCase();
        const inv = await shop.getInventory(user);

        if (itemKey === 'llave') {
          if ((inv.keys || 0) <= 0) return sock.sendMessage(remoteJid, { text: '❌ No tienes llaves.' }, { quoted: msg });
          const jailDB = loadJail();
          if (!jailDB.jailed[user]) return sock.sendMessage(remoteJid, { text: '✅ No estás arrestado.' }, { quoted: msg });
          await shop.useItem(user, 'keys', 1);
          delete jailDB.jailed[user];
          saveJail(jailDB);
          return sock.sendMessage(remoteJid, { text: '🔑 Escapaste de prisión.' }, { quoted: msg });
        }

        if (itemKey === 'caja') {
          if ((inv.cajaUses || 0) <= 0) return sock.sendMessage(remoteJid, { text: '❌ No tienes cajas.' }, { quoted: msg });
          await shop.useItem(user, 'cajaUses', 1);
          const ganar = Math.floor(Math.random() * 2000) + 500;
          await db.addXP(user, ganar);
          return sock.sendMessage(remoteJid, { text: `📦 Abriste la caja y ganaste *+${ganar} XP*` }, { quoted: msg });
        }

        return sock.sendMessage(remoteJid, { text: '❌ Ítem desconocido o no utilizable.' }, { quoted: msg });
      }

      if (command === 'comprar') {
        const itemName = (args[0] || '').toLowerCase();
        const amount = Math.max(1, Math.min(10, Number(args[1]) || 1));
        const item = ITEMS[itemName];
        if (!item) return sock.sendMessage(remoteJid, { text: '❌ Producto no válido.' }, { quoted: msg });

        const userData = await db.getUser(user);
        const xp = Number(userData.xp || 0);
        const total = item.price * amount;

        if (xp < total) return sock.sendMessage(remoteJid, { text: `❌ No tienes suficiente XP. Te faltan ${total - xp} XP.` }, { quoted: msg });

        await db.removeXP(user, total);
        await shop.addItem(user, item.key, amount);
        return sock.sendMessage(remoteJid, { text: `✅ Compraste ${amount}x ${item.name}` }, { quoted: msg });
      }
    } catch (err) {
      console.log('❌ Error en tienda:', err);
    }
  }
};
