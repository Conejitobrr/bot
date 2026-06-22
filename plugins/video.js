'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const yts = require('yt-search');

const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(process.cwd(), 'temp');

// ⏳ COLA POR CHAT: 1 minuto y medio para videos (pesan más)
const QUEUE_DELAY = 90 * 1000;
const queues = new Map();
const processingChats = new Set();

function ensureTemp() {
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function isYouTubeUrl(text = '') {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(text);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sanitizeFileName(name = 'video') {
  return String(name).replace(/[\\/:*?"<>|]/g, '').slice(0, 80).trim() || 'video';
}

// ==========================================
// MOTOR DE COLA PARA VIDEOS
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
      console.log('❌ Error en cola youtube/video:', err?.message || err);
      try { await job.sock.sendMessage(job.remoteJid, { text: '❌ Error al procesar este video.' }, { quoted: job.msg }); } catch {}
    }

    if (queue.length > 0) {
      await sleep(QUEUE_DELAY);
    }
  }

  queues.delete(chatId);
  processingChats.delete(chatId);
}

// ==========================================
// DESCARGA Y ENVÍO DEL VIDEO (HASTA 1080P)
// ==========================================
async function handleDownload(job) {
  const { sock, remoteJid, msg, url, title, id } = job;
  let finalPath = null;

  try {
    ensureTemp();
    
    const fileBase = path.join(TEMP_DIR, `yt_video_${id}.%(ext)s`);

    // El parámetro mágico para 1080p:
    // bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]
    await execFileAsync('yt-dlp', [
      '--extractor-args', 'youtube:player_client=android',
      '--geo-bypass',
      '--force-ipv4',
      '--no-playlist',
      '--ignore-errors',
      '--no-warnings',
      '-f', 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/best',
      '--merge-output-format', 'mp4',
      '-o', fileBase,
      url
    ]);

    const files = fs.readdirSync(TEMP_DIR);
    const downloaded = files.find(f => f.startsWith(`yt_video_${id}`) && f.endsWith('.mp4'));

    if (!downloaded) throw new Error('No se generó el archivo mp4.');

    finalPath = path.join(TEMP_DIR, downloaded);
    const sizeMB = fs.statSync(finalPath).size / 1024 / 1024;

    // WhatsApp permite hasta 100MB aprox en bots, cortamos en 95MB por seguridad
    if (sizeMB > 95) {
      return sock.sendMessage(remoteJid, { text: `❌ El video pesa demasiado (*${sizeMB.toFixed(1)} MB*). WhatsApp solo permite hasta 95 MB.` }, { quoted: msg });
    }

    // Enviamos el video directamente para que se reproduzca en el chat
    await sock.sendMessage(remoteJid, {
      video: fs.readFileSync(finalPath),
      caption: `🎬 *${title}*`,
      mimetype: 'video/mp4',
      fileName: `${sanitizeFileName(title)}.mp4`
    }, { quoted: msg });

  } finally {
    // Limpieza obligatoria del disco duro
    try { if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath); } catch {}
  }
}

// ==========================================
// COMANDO PRINCIPAL
// ==========================================
module.exports = {
  commands: ['video', 'v', 'mp4', 'ytv'],
  description: 'Descarga videos de YouTube en MP4 (hasta 1080p)',

  async execute(ctx) {
    const { sock, remoteJid, args, msg, sender, reply } = ctx;

    try {
      if (!args.length) return reply('❌ Envía un link o nombre del video.\n\nEjemplo:\n.video mr beast');

      const query = args.join(' ').trim();
      await sock.sendMessage(remoteJid, { react: { text: '🔍', key: msg.key } });

      let url = query;
      let title = 'Video de YouTube';
      let thumb = 'https://files.catbox.moe/k3y7a5.jpg'; 
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

      // Descarga de miniatura en memoria RAM (Solución al cuadro negro)
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
      const waitMin = position === 0 ? 0 : position * 1.5; // 1.5 min por ser video

      const id = `${Date.now()}_${Math.floor(Math.random() * 9999)}`;

      queue.push({
        sock, remoteJid, msg, sender, url, title, id
      });

      const textAviso = position === 0
        ? `🎬 *VIDEO EN PROCESO*\n\n👤 *Pedido por:* @${sender.split('@')[0]}\n🎥 *Descargando:* ${title}\n\n⏳ _Procesando video hasta 1080p (Esto puede tardar un poco)..._`
        : `🎬 *AÑADIDO A LA COLA*\n\n👤 *Pedido por:* @${sender.split('@')[0]}\n🎥 *Video:* ${title}\n📌 *Posición:* #${position + 1}\n\n⏳ _Tu pedido se enviará automáticamente en *${waitMin} minuto(s)* para no saturar._`;

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
      console.log('❌ Error en youtube/video:', err?.message || err);
      reply('❌ Error general al solicitar el video.');
    }
  }
};
