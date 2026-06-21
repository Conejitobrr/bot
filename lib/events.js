'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const db = require('./database');

// ⏱️ RELOJ GLOBAL PARA LA CONSOLA TIPO NASA
function getTime() {
  return new Date().toLocaleTimeString('es-PE', { hour12: false });
}

const state = {
  active: null,
  messages: new Map(), // 🔥 Cambiado a Map para mejor gestión de memoria
  timer: null,
  initialized: false
};

const PROFILE_CACHE_TTL = 1000 * 60 * 30; // 30 minutos de caché
const profileCache = new Map();

// 🔥 CACHÉ EN RAM DE LA FOTO POR DEFECTO (Cero lectura de disco tras el arranque)
const DEFAULT_PFP_PATH = fs.existsSync(path.resolve(process.cwd(), 'asset/Sinperfil.jpg'))
  ? path.resolve(process.cwd(), 'asset/Sinperfil.jpg')
  : path.resolve(process.cwd(), 'assets/Sinperfil.jpg');

let defaultPfpBuffer = null;
try {
  if (fs.existsSync(DEFAULT_PFP_PATH)) defaultPfpBuffer = fs.readFileSync(DEFAULT_PFP_PATH);
} catch {}

const CFG = {
  minInterval: 30 * 60 * 1000, 
  maxInterval: 60 * 60 * 1000, 
  duration: 60 * 1000,         
  activityThreshold: 100       
};

const PETS_DIR = path.resolve(__dirname, '../media/mascotas');
const NIVEL_EVOLUCION = 10; 

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr = []) { return arr[Math.floor(Math.random() * arr.length)]; }
function now() { return Date.now(); }
function getState() { return state.active; }
function isActive(type = '') {
  if (!state.active) return false;
  if (!type) return true;
  return state.active.type === type;
}
function getMultiplier() { return state.active?.type === 'double' ? 2 : 1; }

// 🔥 SISTEMA MULTIMEDIA HÍBRIDO (FOTOS/VIDEOS) PARA LAS MASCOTAS
function getPetMedia(type, estado, level) {
  const stage = level >= NIVEL_EVOLUCION ? 'adulto' : 'bebe';
  const safeType = String(type).toLowerCase().replace(/\s+/g, '_');
  const baseName = `${safeType}_${stage}_${estado}`;

  const extensions = ['.mp4', '.jpg', '.png', '.jpeg'];
  for (const ext of extensions) {
    const filePath = path.join(PETS_DIR, baseName + ext);
    if (fs.existsSync(filePath)) {
      return { buffer: fs.readFileSync(filePath), isVideo: ext === '.mp4' };
    }
  }
  return null; 
}

async function sendMediaMsg(sock, remoteJid, media, text) {
  if (!media) return sock.sendMessage(remoteJid, { text });
  if (media.isVideo) return sock.sendMessage(remoteJid, { video: media.buffer, caption: text, gifPlayback: true });
  return sock.sendMessage(remoteJid, { image: media.buffer, caption: text });
}

// ─────────────────────────────────────────
// 🚀 INICIALIZADOR DEL SISTEMA
// ─────────────────────────────────────────
function init(sock) {
  if (!sock) return;
  state.initialized = true;

  sock.ev.on('group-participants.update', async update => {
    try { await onParticipantsUpdate(sock, update); } 
    catch (e) { console.log(chalk.gray(`[${getTime()}] `) + chalk.red('❌ [ERROR BIENVENIDA]:'), e?.message || e); }
  });

  console.log(chalk.gray(`[${getTime()}] `) + chalk.blue('🎉 [EVENTOS] Minijuegos y Bienvenidas iniciados.'));
  scheduleNext(sock);
}

function scheduleNext(sock) {
  if (state.timer) clearTimeout(state.timer);
  const delay = rand(CFG.minInterval, CFG.maxInterval);
  state.timer = setTimeout(() => {
    maybeStartEvent(sock).catch(() => scheduleNext(sock));
  }, delay);
}

async function maybeStartEvent(sock, groupId = null) {
  if (state.active) return;

  const type = pick(['bonus', 'rob', 'trivia', 'double']);

  state.active = {
    type,
    groupId,
    endsAt: now() + CFG.duration,
    answer: type === 'trivia' ? String(rand(1, 10)) : null,
    winner: null
  };

  if (groupId) {
    console.log(chalk.gray(`[${getTime()}] `) + chalk.magenta('🎲 [MINIJUEGO] ') + chalk.yellow(`Evento ${type.toUpperCase()} iniciado en un grupo.`));
    await announceEvent(sock, state.active);
  }
  setTimeout(() => finishEvent(sock), CFG.duration + 1000);
}

async function onMessage(ctx) {
  const { sock, remoteJid, body, sender, pushName, fromGroup } = ctx;
  if (!fromGroup || !remoteJid) return;

  // 🔥 APAGADO ABSOLUTO
  const groupData = await db.getGroup(remoteJid);
  if (groupData.bot === false) return; 

  // 🔥 SHADOWBAN
  const isBanned = await db.isBanned(sender);
  if (isBanned) return;

  // RASTREADOR DE ACTIVIDAD EN RAM
  const currentMsgCount = (state.messages.get(remoteJid) || 0) + 1;
  state.messages.set(remoteJid, currentMsgCount);

  if (!state.active && currentMsgCount >= CFG.activityThreshold) {
    state.messages.set(remoteJid, 0); // Reset
    await maybeStartEvent(sock, remoteJid);
  }

  if (!state.active || state.active.groupId !== remoteJid) return;
  if (now() > state.active.endsAt) return;

  const text = String(body || '').toLowerCase().trim();

  // 💰 EVENTO BONUS
  if (state.active.type === 'bonus' && text === 'yo' && !state.active.winner) {
    state.active.winner = sender;
    let gain = rand(1500, 3000); 
    const userData = await db.getUser(sender);
    const p = userData.pet;

    let txt = `🎉 ¡Qué velocidad! ${pushName} ganó *+${gain} XP*`;
    let media = null;

    if (p) {
      gain *= 2; 
      media = getPetMedia(p.type, 'celebrando', p.level);
      txt = `🎉 ¡Qué velocidad! ${pushName} ganó *+${gain} XP*\n\n✨ ¡Gracias a la ayuda de tu mascota *${p.name}*, obtuviste el DOBLE de recompensa!`;
    }

    await db.addXP(sender, gain);
    await sendMediaMsg(sock, remoteJid, media, txt);
    console.log(chalk.gray(`[${getTime()}] `) + chalk.green(`🏆 [MINIJUEGO] ${pushName} ganó el evento BONUS.`));
    return endEvent(sock);
  }

  // 😈 EVENTO ROBO
  if (state.active.type === 'rob' && text === 'robaxp' && !state.active.winner) {
    state.active.winner = sender;
    let bonus = rand(1000, 2500); 
    const userData = await db.getUser(sender);
    const p = userData.pet;

    let txt = `😈 Misión cumplida. ${pushName} se robó el botín de *+${bonus} XP*`;
    let media = null;

    if (p) {
      bonus *= 2; 
      media = getPetMedia(p.type, 'celebrando', p.level);
      txt = `😈 Misión cumplida. ${pushName} se robó el botín de *+${bonus} XP*\n\n✨ ¡Tu mascota *${p.name}* te ayudó a cargar el botín! Obtienes el DOBLE de experiencia.`;
    }

    await db.addXP(sender, bonus);
    await sendMediaMsg(sock, remoteJid, media, txt);
    console.log(chalk.gray(`[${getTime()}] `) + chalk.green(`🏆 [MINIJUEGO] ${pushName} ganó el evento ROBO.`));
    return endEvent(sock);
  }

  // 🎯 EVENTO TRIVIA
  if (state.active.type === 'trivia' && text === state.active.answer && !state.active.winner) {
    state.active.winner = sender;
    let gain = rand(2000, 4000); 
    const userData = await db.getUser(sender);
    const p = userData.pet;

    let txt = `🏆 ¡Correcto! ${pushName} acertó el número ${state.active.answer} y se lleva *+${gain} XP*`;
    let media = null;

    if (p) {
      gain *= 2; 
      media = getPetMedia(p.type, 'celebrando', p.level);
      txt = `🏆 ¡Correcto! ${pushName} acertó el número ${state.active.answer} y se lleva *+${gain} XP*\n\n✨ ¡*${p.name}* aúlla de felicidad por tu victoria! Obtienes el DOBLE de experiencia.`;
    }

    await db.addXP(sender, gain);
    await sendMediaMsg(sock, remoteJid, media, txt);
    console.log(chalk.gray(`[${getTime()}] `) + chalk.green(`🏆 [MINIJUEGO] ${pushName} ganó la TRIVIA.`));
    return endEvent(sock);
  }

  // ⚡ EVENTO DOBLE XP
  if (state.active.type === 'double' && text === 'doble' && !state.active.winner) {
    state.active.winner = sender;
    const userData = await db.getUser(sender);
    const p = userData.pet;

    let txt = `⚡ ${pushName} ha reclamado la energía. ¡Todos ganan *doble XP* durante este evento!`;
    let media = null;

    if (p) {
      media = getPetMedia(p.type, 'celebrando', p.level);
      txt = `⚡ ${pushName} ha reclamado la energía. ¡Todos ganan *doble XP* durante este evento!\n\n✨ ¡A *${p.name}* le encanta esta energía!`;
    }

    await sendMediaMsg(sock, remoteJid, media, txt);
    console.log(chalk.gray(`[${getTime()}] `) + chalk.green(`🏆 [MINIJUEGO] ${pushName} activó la DOBLE XP.`));
    return endEvent(sock);
  }
}

async function announceEvent(sock, ev) {
  if (!ev?.groupId) return;
  const seconds = Math.floor(CFG.duration / 1000);
  const text = {
    bonus: `💰 *EVENTO BONUS* 💰\n\nEl primero en escribir *yo* se lleva la caja fuerte.\n⏳ Tienes ${seconds}s`,
    rob: `😈 *ROBO GLOBAL* 😈\n\nEl primero en escribir *robaxp* se roba el botín.\n⏳ Tienes ${seconds}s`,
    trivia: `🎯 *TRIVIA EXPRESS* 🎯\n\nEstoy pensando en un número del *1 al 10*. ¡El primero en adivinar gana!\n⏳ Tienes ${seconds}s`,
    double: `⚡ *DOBLE XP* ⚡\n\nEl primero en escribir *doble* activa doble XP para todos temporalmente.\n⏳ Tienes ${seconds}s`
  }[ev.type];

  await sock.sendMessage(ev.groupId, { text });
}

async function endEvent(sock) {
  state.active = null;
  scheduleNext(sock);
}

async function finishEvent(sock) {
  if (!state.active) return;
  const { groupId, winner } = state.active;

  if (groupId && !winner) {
    await sock.sendMessage(groupId, { text: '⏱️ El tiempo se acabó y nadie fue lo suficientemente rápido. El evento desapareció en las sombras 😶' });
    console.log(chalk.gray(`[${getTime()}] `) + chalk.yellow(`💨 [MINIJUEGO] Evento en el grupo terminó sin ganador.`));
  }
  state.active = null;
  scheduleNext(sock);
}

// ─────────────────────────────────────────
// 🖼️ GESTOR DE FOTOS DE PERFIL (Caché Optimizada)
// ─────────────────────────────────────────
async function getProfilePictureWithRetry(sock, user, retries = 1) {
  const cached = profileCache.get(user);
  if (cached && cached.expires > Date.now()) return cached;

  for (let i = 0; i < retries; i++) {
    try {
      const url = await sock.profilePictureUrl(user, 'image');
      const res = await fetch(url);
      const buffer = Buffer.from(await res.arrayBuffer());
      const data = { buffer, expires: Date.now() + PROFILE_CACHE_TTL };
      profileCache.set(user, data);
      return data;
    } catch {
      // Si falla (privacidad, no foto), usamos la RAM almacenada
      const data = { buffer: defaultPfpBuffer, expires: Date.now() + PROFILE_CACHE_TTL };
      profileCache.set(user, data);
      return data;
    }
  }
}

async function sendWelcome(sock, groupId, caption, mentions, photoData) {
  try {
    if (photoData?.buffer) {
      return await sock.sendMessage(groupId, { image: photoData.buffer, caption, mentions });
    }
    return await sock.sendMessage(groupId, { text: caption, mentions });
  } catch (e) {
    await sock.sendMessage(groupId, { text: caption, mentions });
  }
}

// ─────────────────────────────────────────
// 👋 EVENTO: BIENVENIDAS Y DESPEDIDAS
// ─────────────────────────────────────────
async function onParticipantsUpdate(sock, update) {
  const { id, participants = [], action } = update;
  if (!id || !participants.length) return;

  const enabled = await db.getGroupSetting(id, 'welcome');
  if (!enabled) return;

  const groupData = await db.getGroup(id);
  if (groupData.bot === false) return;

  let metadata;
  try { 
    metadata = await sock.groupMetadata(id); 
  } catch { 
    metadata = { subject: 'este grupo', desc: 'Disfruta tu estadía.' }; // Fallback si WA no responde
  }

  const groupName = metadata.subject || 'Grupo';
  const groupDesc = metadata.desc || 'Sin descripción';

  for (const user of participants) {
    const num = user.split('@')[0];
    const photoData = await getProfilePictureWithRetry(sock, user);

    if (action === 'add') {
      console.log(chalk.gray(`[${getTime()}] `) + chalk.green(`👋 [NUEVO USUARIO] +${num} entró a ${groupName}`));
      const caption = `╭─❖「 👋 BIENVENIDO 」\n│\n│ ✦ Hola @${num}\n│ ✦ Bienvenido a *${groupName}*\n│\n│ 📝 ${groupDesc.slice(0, 120)}\n│\n╰──────────────`;
      await sendWelcome(sock, id, caption, [user], photoData);
    }

    if (action === 'remove') {
      console.log(chalk.gray(`[${getTime()}] `) + chalk.red(`🚪 [SALIDA] +${num} salió de ${groupName}`));
      const caption = `╭─❖「 😢 DESPEDIDA 」\n│\n│ @${num} salió del grupo\n│ Te extrañaremos...\n│\n│ Ojalá te atropelle un carro\n│ pero con cariño 💔🚗\n│\n╰──────────────`;
      await sendWelcome(sock, id, caption, [user], photoData);
    }
  }
}

module.exports = {
  init, onMessage, onParticipantsUpdate, getProfilePictureWithRetry, getState, isActive, getMultiplier
};
