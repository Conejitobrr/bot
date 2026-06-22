'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const yts = require('yt-search');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');

// ⏳ COLA POR CHAT: 1 minuto (60,000 ms)
const QUEUE_DELAY = 60 * 1000;
const queues = new Map();
const processingChats = new Set();

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function isYouTubeUrl(text = '') {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(text);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sanitizeFileName(name = 'audio') {
  return String(name).replace(/[\\/:*?"<>|]/g, '').slice(0, 80).trim() || 'audio';
}

// ==========================================
// MOTOR DE COLA (Procesa 1 por 1 cada minuto)
// ==========================================
async function processQueue(chatId) {
  if (processingChats.has(chatId)) return;
  processingChats.add(chatId);

  const queue = queues.get(chatId) || [];

  while (queue.length > 0) {
    const job = queue.shift();

    try {
      await handleDownload(job);
    } catch (err) {
      console.log('❌ Error en cola youtube/play:', err?.message || err);
      await job.sock.sendMessage(job.remoteJid, { text: '❌ Error al procesar esta canción.' }, { quoted: job.msg });
    }

    // Si aún hay canciones en la cola de este grupo, espera 1 minuto
    if (queue.length > 0) {
      await sleep(QUEUE_DELAY);
    }
  }

  queues.delete(chatId);
  processingChats.delete(chatId);
}

// ==========================================
// DESCARGA Y ENVÍO CON YT-DLP
// ==========================================
async function handleDownload(job) {
  const { sock, remoteJid, msg, url, title, id } = job;
  let finalPath = null;

  try {
    ensureTemp();
    
    // Ruta temporal con el ID único
    const fileBase = path.join(TEMP_DIR, `yt_audio_${id}.%(ext)s`);

    // Ejecutamos YT-DLP (La bestia anti-bloqueos)
    await execFileAsync('yt-dlp', [
      '--extractor-args', 'youtube:player_client=android',
      '--geo-bypass',
      '--force-ipv4',
      '--no-playlist',
      '--ignore-errors',
      '--no-warnings',
      '-f', 'ba/b',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '320K',
      '-o', fileBase,
      url
    ]);

    // Buscamos el archivo descargado
    const files = fs.readdirSync(TEMP_DIR);
    const downloaded = files.find(f => f.startsWith(`yt_audio_${id}`) && f.endsWith('.mp3'));

    if (!downloaded) throw new Error('No se generó el archivo mp3.');

    finalPath = path.join(TEMP_DIR, downloaded);
    const sizeMB = fs.statSync(finalPath).size / 1024 / 1024;

    if (sizeMB > 95) {
      return sock.sendMessage(remoteJid, { text: '❌ El audio pesa demasiado para enviarlo por WhatsApp.' }, { quoted: msg });
    }

    // Enviamos el audio respondiendo al mensaje original
    await sock.sendMessage(remoteJid, {
      audio: fs.readFileSync(finalPath),
      mimetype: 'audio/mpeg',
      fileName: `${sanitizeFileName(title)}.mp3`
    }, { quoted: msg });

  } finally {
    // 🧹 Limpieza: borramos el archivo pesando de la memoria
    try { if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch {}
  }
}

// ==========================================
// COMANDO PRINCIPAL
// ==========================================
module.exports = {
  commands: ['yt', 'play', 'youtube', 'p'],

  async execute(ctx) {
    const { sock, remoteJid, args, msg, sender, pushName, reply } = ctx;

    try {
      if (!args.length) return reply('❌ Envía un link o nombre de canción.\n\nEjemplo:\n.play bad bunny');

      const query = args.join(' ').trim();
      await sock.sendMessage(remoteJid, { react: { text: '🔍', key: msg.key } });

      // 1. Buscamos la info ANTES de poner en cola para mostrar la tarjeta bonita
      let url = query;
      let title = 'Audio de YouTube';
      let thumb = 'https://files.catbox.moe/k3y7a5.jpg'; // Imagen por defecto
      let author = 'YouTube';

      if (!isYouTubeUrl(query)) {
        const res = await yts(query);
        const video = res.videos?.find(v => v.url && !v.title?.toLowerCase().includes('mix') && !v.title?.toLowerCase().includes('playlist')) || res.videos?.[0];
        
        if (!video) return reply('❌ No se encontraron resultados.');
        
        url = video.url;
        title = video.title;
        thumb = video.thumbnail;
        author = video.author?.name || 'Desconocido';
      }

      // 2. Gestionamos la cola INDEPENDIENTE POR GRUPO
      if (!queues.has(remoteJid)) queues.set(remoteJid, []);
      const queue = queues.get(remoteJid);
      
      const position = queue.length + (processingChats.has(remoteJid) ? 1 : 0);
      const waitMin = position === 0 ? 0 : position * 1; // 1 minuto por cada canción en cola

      const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;

      // 3. Añadimos a la lista de tareas
      queue.push({
        sock, remoteJid, msg, sender, url, title, id
      });

      // 4. Tarjeta visual premium de aviso
      const textAviso = position === 0
        ? `📥 *CANCION EN PROCESO*\n\n👤 *Pedido por:* @${sender.split('@')[0]}\n🎶 *Descargando:* ${title}\n\n⏳ _Procesando audio de alta calidad..._`
        : `📥 *AÑADIDA A LA COLA*\n\n👤 *Pedido por:* @${sender.split('@')[0]}\n🎶 *Canción:* ${title}\n📌 *Posición:* #${position + 1}\n\n⏳ _Tu pedido se enviará automáticamente en *${waitMin} minuto(s)* para evitar el spam._`;

      await sock.sendMessage(remoteJid, {
        text: textAviso,
        mentions: [sender],
        contextInfo: {
          externalAdReply: {
            title: title,
            body: `Canal: ${author}`,
            thumbnailUrl: thumb,
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: msg });

      // 5. Iniciar la procesadora si estaba dormida
      processQueue(remoteJid);

    } catch (err) {
      console.log('❌ Error en youtube/play:', err?.message || err);
      reply('❌ Error general al solicitar el audio.\nVerifica que yt-dlp esté instalado en el servidor.');
    }
  }
};
