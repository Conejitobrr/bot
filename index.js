'use strict';

require('dotenv').config();

const chalk = require('chalk');
const figlet = require('figlet');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const config = require('./config');

// ☁️ Detección de entorno VPS / Cloud (PM2, Docker, Producción)
const IS_CLOUD = process.env.NODE_ENV === 'production' || process.env.PM2_HOME || process.env.SERVER_MODE === 'true';

function showBanner() {
  console.clear();

  const botName = config.botName || 'SiriusBot';
  const lines = figlet.textSync(botName, { font: 'Big' }).split('\n');

  lines.forEach(line => console.log(chalk.cyan.bold(line)));

  console.log('');
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log(chalk.white('  🤖 Bot     : ') + chalk.green(botName));
  console.log(chalk.white('  📦 Versión : ') + chalk.yellow(config.botVersion || '1.0.0'));
  console.log(chalk.white('  ⚙️ Prefijo : ') + chalk.yellow(config.prefix || '.'));
  console.log(chalk.white('  ☁️ Entorno : ') + chalk.magenta(IS_CLOUD ? 'Cloud / VPS (Modo Seguro)' : 'Local / Desarrollo'));
  console.log(chalk.gray('  ─────────────────────────────────────────\n'));
}

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function ask(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

function hasSavedSession() {
  const sessionDir = path.resolve(process.cwd(), config.sessionPath || './session');
  const credsFile = path.join(sessionDir, 'creds.json');
  return fs.existsSync(credsFile);
}

async function askConnectionMethod() {
  if (hasSavedSession()) {
    console.log(chalk.green('  ✅ Sesión encontrada. Conectando automáticamente...\n'));
    return { method: 'saved', phone: null };
  }

  const defaultPhone = process.env.DEFAULT_PHONE || config.owner?.[0] || '';

  // ☁️ PROTECCIÓN CLOUD: Evitar readline en VPS para que no se congele
  if (IS_CLOUD) {
    console.log(chalk.yellow('  ⚠️ Modo Cloud detectado. Omitiendo consola interactiva...'));
    if (!defaultPhone) {
      console.log(chalk.red('\n  ❌ ERROR FATAL: En modo Cloud debes tener "DEFAULT_PHONE" en el .env o config para iniciar por primera vez.'));
      process.exit(1);
    }
    const cleanPhone = String(defaultPhone).replace(/\D/g, '');
    console.log(chalk.cyan(`  📲 Solicitando código de emparejamiento para: +${cleanPhone}\n`));
    return { method: 'code', phone: cleanPhone };
  }

  // 💻 MODO LOCAL
  const rl = createRL();

  console.log(chalk.cyan('  ¿Cómo deseas conectar WhatsApp?\n'));
  console.log(chalk.white('  [1] QR'));
  console.log(chalk.white('  [2] Código de Emparejamiento\n'));

  let choice = '';
  while (!['1', '2'].includes(choice)) {
    choice = await ask(rl, chalk.yellow('  → Opción (1 o 2): '));
  }

  if (choice === '1') {
    rl.close();
    return { method: 'qr', phone: null };
  }

  if (defaultPhone) {
    console.log(chalk.gray(`\n  Número por defecto detectado: +${defaultPhone}`));
  }

  let phone = await ask(
    rl,
    chalk.yellow('  → Presiona ENTER para usar el por defecto, o escribe otro número (con código de país): ')
  );

  if (!phone) phone = defaultPhone;
  phone = String(phone).replace(/\D/g, '');

  rl.close();

  if (!phone) {
    console.log(chalk.red('\n  ❌ No ingresaste ningún número. Abortando.\n'));
    process.exit(1);
  }

  return { method: 'code', phone };
}

async function main() {
  showBanner();

  const { method, phone } = await askConnectionMethod();

  console.log(chalk.cyan('  🚀 Iniciando motor central...\n'));

  try {
    const { startBot } = require('./main');
    await startBot({ method, phone });
  } catch (e) {
    console.error(chalk.red('❌ Error crítico al iniciar el bot:'), e?.message || e);
    process.exit(1);
  }
}

// 🛡️ MANEJO DE ERRORES GLOBALES (Evita que el bot se caiga por completo)
process.on('uncaughtException', err => {
  console.log(chalk.red('\n[💥 UNCAUGHT EXCEPTION]'), err);
});

process.on('unhandledRejection', err => {
  console.log(chalk.red('\n[⚠️ UNHANDLED REJECTION]'), err);
});

// 🔌 CIERRE ELEGANTE PARA EL VPS (Evita corromper datos al reiniciar)
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n  🛑 [SIGINT] Apagando el bot de forma segura...'));
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n  🛑 [SIGTERM] Servidor solicitó apagado. Cerrando...'));
  process.exit(0);
});

main();
