'use strict';

const db = require('../lib/database');

let events = null;
try {
  events = require('../lib/events');
} catch {}

// 💘 emojis base para randomizar estilo
const emojis = ['💖', '✨', '💘', '🌹', '😍', '💫', '🥰', '🔥', '🌸', '💌', '😳', '💞'];

const piropos = [
  '💖 Me gustaría ser papel para poder envolver ese bombón 🍫✨',
  '📶 Eres como wifi sin contraseña, todo el mundo te busca 📱💘',
  '🚌 Quién fuera bus para recorrer las curvas de tu corazón 💓🛣️',
  '🕊️ Quiero volar sin alas y perderme en tu universo 🌌✨',
  '🧈 Quisiera ser mantequilla para derretirme en tu arepa 🫓🔥',
  '⚖️ Si la belleza fuera pecado, ya estarías en el infierno 😈🔥',
  '💔 Robar está mal, pero un beso tuyo sí me lo robaría 💋😳',
  '🌞 Bonita, camina por la sombra que el sol derrite chocolates 🍫☀️',
  '🔍 Pareces Google, tienes todo lo que busco 💻💖',
  '☕ Mi café favorito es el de tus ojos 👀✨',

  '🌟 Si fueras estrella, el cielo te buscaría para no perderte 🌌💫',
  '📡 No eres WiFi, pero igual me conectas el corazón 💓📶',
  '🐞 Eres el bug más bonito que me pasó en la vida 💻💘',
  '⚠️ Tu sonrisa debería venir con advertencia de adicción 😍🚨',
  '💌 Si el amor tuviera forma, tendría tu nombre ✍️❤️',

  '🧠 Si la perfección tuviera cara, estaría copiando la tuya 😳✨',
  '🧩 Eres el tipo de problema que no quiero resolver nunca 💘🌀',
  '🌠 Tu mirada tiene más magia que todos mis sueños juntos ✨👀',
  '🔄 Eres el motivo por el que el corazón se salta actualizaciones 💓📲',
  '🎵 Si fueras canción, te pondría en loop infinito 🔁🎶',
  '🧮 Eres como un algoritmo perfecto: imposible de ignorar 💻💖',
  '🖼️ No sé si eres real o un render del universo en ultra HD 🌌✨',
  '🗺️ Tus ojos deberían venir con mapa porque me pierdo en ellos 👀💫',
  '💬 Eres ese “hola” que nunca quiero que termine 🥺💞',
  '📱 Si fueras app, nunca la desinstalaría 💖📲',

  '❌ Eres el error 404 que sí quiero encontrar 💻❤️',
  '🌞 El universo hizo zoom cuando te creó 🌌✨',
  '💫 No eres casualidad, eres destino con buena estética 🎨💘',
  '☀️ Eres como el sol… pero sin modo oscuro posible 😎🔥',
  '🏅 Si mirarte fuera deporte, ya tendría medalla de oro 🥇👀',
  '🧬 Eres el glitch más bonito del sistema 💻💖',
  '⚗️ Si el amor fuera ciencia, tú serías la fórmula prohibida 💘🧪',
  '🌧️ Eres como un lunes bonito… imposible pero real 📅💫',
  '🔕 Contigo hasta el silencio suena bien 🤍🎧',
  '🔔 Eres la notificación que nunca quiero silenciar 📱💖',

  '🎮 Si la vida fuera juego, tú serías el nivel secreto 🕹️✨',
  '🌈 Eres el brillo que le faltaba a este mundo en baja resolución 💫🖥️',
  '💭 No eres un sueño… pero claramente te soñaron bien 🌙✨',
  '📊 Eres el tipo de casualidad que rompe estadísticas 📉💘',
  '⏳ Si el tiempo se detuviera, lo haría mirándote 👀💓',
  '✍️ Eres poesía sin necesidad de rimar 📖💖',
  '🌇 Tienes más encanto que un atardecer inesperado 🌅✨',
  '📚 Eres el capítulo favorito que no quiero terminar 💘📖',
  '🧭 Si el destino tuviera rostro, se parecería al tuyo 💫❤️'
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  commands: ['piropo'],
  description: 'Envía un piropo mencionando a alguien',

  async execute(ctx) {
    const { sock, remoteJid, msg, sender } = ctx;

    const randomPiropo = pick(piropos);
    const emoji = pick(emojis);

    let target;

    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
      target = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
      target = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
    }

    if (!target) {
      return sock.sendMessage(remoteJid, {
        text: `❌ Debes mencionar o responder a alguien para enviarle un piropo ${emoji}`
      }, { quoted: msg });
    }

    const numero = target.split('@')[0];

    // 💌 mensaje limpio con mención integrada
    const text = `${emoji} @${numero} ${randomPiropo}`;

    await sock.sendMessage(remoteJid, {
      text,
      mentions: [target]
    }, { quoted: msg });

    // ⭐ XP BASE
    let xp = Math.floor(Math.random() * 21) + 10;

    // ⚡ DOUBLE XP EVENT
    if (events?.isActive?.('double')) {
      xp *= events.getMultiplier?.() || 2;
    }

    await db.addXP(sender, xp, { source: 'plugin:piropo' });
  }
};
