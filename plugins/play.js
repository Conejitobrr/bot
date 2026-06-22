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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sanitizeFileName(name = 'audio') {
  return String(name).replace(/[\\/:*?"<>|]/g, '').slice(0, 80).trim() || 'audio';
}

// ==========================================
// MOTOR DE COLA PARA AUDIO
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
      try { await job.sock.sendMessage(job.remoteJid, { text: '❌ Error al procesar esta canción.' }, { quoted: job.msg }); } catch {}
    }

    if (queue.length > 0) {
      await sleep(QUEUE_DELAY);
    }
  }

  queues.delete(chatId);
  processingChats.delete(chatId);
}

// ==========================================
// DESCARGA Y ENVÍO DEL AUDIO CON YT-DLP
// ==========================================
async function handleDownload(job) {
  const { sock, remoteJid, msg, url, title, id } = job;
  let finalPath = null;

  try {
    ensureTemp();
    
    const fileBase = path.join(TEMP_DIR, `yt_audio_${id}.%(ext)s`);

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

    const files = fs.readdirSync(TEMP_DIR);
    const downloaded = files.find(f => f.startsWith(`yt_audio_${id}`) && f.endsWith('.mp3'));

    if (!downloaded) throw new Error('No se generó el archivo mp3.');

    finalPath = path.join(TEMP_DIR, downloaded);
    const sizeMB = fs.statSync(finalPath).size / 1024 / 1024;

    if (sizeMB > 95) {
      return sock.sendMessage(remoteJid, { text: '❌ El audio pesa demasiado para enviarlo por WhatsApp.' }, { quoted: msg });
    }

    await sock.sendMessage(remoteJid, {
      audio: fs.readFileSync(finalPath),
      mimetype: 'audio/mpeg',
      fileName: `${sanitizeFileName(title)}.mp3`
    }, { quoted: msg });

  } finally {
    try { if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch {}
  }
}

// ==========================================
// COMANDO PRINCIPAL
// ==========================================
module.exports = {
  commands: ['yt', 'play', 'youtube', 'p'],
  description: 'Descarga audios de YouTube en MP3 (320kbps)',

  async execute(ctx) {
    const { sock, remoteJid, args, msg, sender, reply } = ctx;

    try {
      if (!args.length) return reply('❌ Envía un link o nombre de canción.\n\nEjemplo:\n.play bad bunny');

      const query = args.join(' ').trim();
      await sock.sendMessage(remoteJid, { react: { text: '🔍', key: msg.key } });

      let url = query;
      let title = 'Audio de YouTube';
      let thumb = 'https://files.catbox.moe/k3y7a5.jpg'; 
      let author = 'YouTube';

      // 🔥 LÓGICA CORREGIDA: Detectar URLs y obtener información real (Igual que en video.js)
      const ytRegex = /(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
      const match = query.match(ytRegex);

      if (match && match[1]) {
        // ES UN ENLACE
        const video = await yts({ videoId: match[1] });
        if (!video) return reply('❌ No se pudo obtener la información de ese enlace.');
        
        url = video.url;
        title = video.title;
        thumb = video.thumbnail;
        author = video.author?.name || 'Desconocido';
      } else {
        // ES UN TEXTO (Búsqueda)
        const res = await yts(query);
        const video = res.videos?.find(v => v.url && !v.title?.toLowerCase().includes('mix') && !v.title?.toLowerCase().includes('playlist')) || res.videos?.[0];
        
        if (!video) return reply('❌ No se encontraron resultados.');
        
        url = video.url;
        title = video.title;
        thumb = video.thumbnail;
        author = video.author?.name || 'Desconocido';
      }

      // Descarga de miniatura en memoria RAM (Evita el cuadro negro)
      let thumbBuffer;
      try {
        const response = await fetch(thumb);
        const arrayBuffer = await response.arrayBuffer();
        thumbBuffer = Buffer.from(arrayBuffer);
      } catch (err) {
        thumbBuffer = undefined;
      }

      // Gestión de la cola independiente
      if (!queues.has(remoteJid)) queues.set(remoteJid, []);
      const queue = queues.get(remoteJid);
      
      const position = queue.length + (processingChats.has(remoteJid) ? 1 : 0);
      const waitMin = position === 0 ? 0 : position * 1; 

      const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;

      queue.push({
        sock, remoteJid, msg, sender, url, title, id
      });

      const textAviso = position === 0
        ? `📥 *CANCIÓN EN PROCESO*\n\n👤 *Pedido por:* @${sender.split('@')[0]}\n🎶 *Descargando:* ${title}\n\n⏳ _Procesando audio de alta calidad..._`
        : `📥 *AÑADIDA A LA COLA*\n\n👤 *Pedido por:* @${sender.split('@')[0]}\n🎶 *Canción:* ${title}\n📌 *Posición:* #${position + 1}\n\n⏳ _Tu pedido se enviará automáticamente en *${waitMin} minuto(s)* para evitar el spam._`;

      await sock.sendMessage(remoteJid, {
        text: textAviso,
        mentions: [sender],
        contextInfo: {
          externalAdReply: {
            title: title,
            body: `Canal: ${author}`,
            thumbnail: thumbBuffer, 
            sourceUrl: url, 
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      }, { quoted: msg });

      processQueue(remoteJid);

    } catch (err) {
      console.log('❌ Error en youtube/play:', err?.message || err);
      reply('❌ Error general al solicitar el audio.\nVerifica que yt-dlp esté instalado en el servidor.');
    }
  }
};
