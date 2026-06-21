'use strict';

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const shop = require('../lib/shop'); 

// 🔥 CANDADO ANTI-SPAM
const enUso = new Set();

function cleanJid(jid = '') {
    return String(jid).split(':')[0];
}

function number(jid = '') {
    return cleanJid(jid).split('@')[0].replace(/\D/g, '');
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randXP(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ==========================================
// DICCIONARIOS DE VARIEDAD (PESCA)
// ==========================================
const pescaLegendaria = [
    '🦈 ¡INCREÍBLE! Pescaste un *Megalodón* y lo vendiste en el mercado negro.',
    '🏴‍☠️ ¡Pesca histórica! Enganchaste un *Cofre Pirata* lleno de joyas antiguas.',
    '🧜‍♀️ ¡Wow! Una *Sirena* se enredó en tu red y te pagó con perlas para que la liberes.',
    '🐉 Pescaste al mismísimo *Monstruo del Lago Ness* y los periódicos te pagaron millones.'
];
const pescaEpica = [
    '🐡 ¡Genial! Pescaste un raro *Pez Globo Dorado*.',
    '🐟 ¡Qué fuerza! Lograste sacar un *Atún Aleta Amarilla* gigante.',
    '⚔️ Luchaste por horas y pescaste un enorme *Pez Espada*.',
    '🦑 Pescaste un *Calamar Gigante* que casi hunde tu bote.'
];
const pescaNormal = [
    '🐟 Pescaste un hermoso *Salmón* para la cena.',
    '🐠 Conseguiste una buena *Corvina* fresca.',
    '🐟 Pescaste un *Bonito* de buen tamaño.',
    '🐡 Atrapaste un montón de *Pejerreyes*.',
    '🐟 Sacaste una *Trucha* de río muy apetitosa.',
    '🐠 Pescaste una *Tilapia* promedio.'
];
const pescaBasura = [
    '🥾 Qué asco... Pescaste una *bota vieja y apestosa*.',
    '🛞 Enganchaste una *llanta pinchada* llena de lodo.',
    '🌿 Solo sacaste un montón de *algas enredadas*.',
    '🩲 Pescaste un *calzoncillo mojado* de alguien más... qué asco.',
    '🍾 Enganchaste una *botella de plástico* vacía. Al menos limpiaste el mar.'
];
const pescaCastigo = [
    '🐊 ¡CUIDADO! Un *cocodrilo* salió del agua y te mordió. Pagaste medicinas.',
    '🦈 Un *tiburón* saltó, se comió tu pesca y rompió tu caña carísima.',
    '🌊 Te resbalaste, caíste al agua y *perdiste tu billetera*.',
    '🦅 Un *pelícano gigante* te atacó y se robó lo que habías pescado.',
    '👮‍♂️ La policía marítima te multó por *pescar sin licencia*.'
];

// ==========================================
// DICCIONARIOS DE VARIEDAD (MINERÍA)
// ==========================================
const minaLegendaria = [
    '💎 ¡JACKPOT! Encontraste un gigantesco *Diamante Brillante*.',
    '🛸 ¡Increíble! Picaste un *Meteorito Alienígena* que vale una fortuna.',
    '🟢 Encontraste una *Esmeralda* del tamaño de un melón.',
    '🔴 Picaste la pared y descubriste la mítica *Gema del Infinito*.'
];
const minaEpica = [
    '🥇 ¡Excelente! Rompiste la piedra y sacaste un *Lingote de Oro puro*.',
    '🔮 Encontraste una cueva oculta llena de *Zafiros Azules*.',
    '💎 Extraíste una hermosa *Geoda de Amatista*.',
    '🔥 Encontraste *Magma Cristalizada* súper rara.'
];
const minaNormal = [
    '🪨 Trabajaste duro y recolectaste bastante *Carbón y Hierro*.',
    '🥉 Lograste extraer varios kilos de *Cobre*.',
    '✨ Encontraste polvo de *Redstone* luminoso.',
    '🔵 Extraíste un poco de *Lapislázuli* para encantamientos.',
    '🪨 Picaste un buen rato y sacaste mucha *Piedra y Cuarzo*.'
];
const minaBasura = [
    '🕸️ Picaste en el lugar equivocado. Solo había *telarañas y polvo*.',
    '🦴 Desenterraste unos *huesos viejos* de perro.',
    '🪨 Picaste y picaste pero solo sacaste *grava inútil*.',
    '⛏️ Solo encontraste *tierra mojada* y gusanos.',
    '🦇 Te metiste a una cueva vacía que solo olía a *guano de murciélago*.'
];
const minaCastigo = [
    '💥 ¡DERRUMBE! Un pedazo de techo te cayó en la cabeza. Pagaste el hospital.',
    '🧨 Picaste donde no debías y *explotó un Creeper* en tu cara.',
    '🌋 Resbalaste y *te caíste a un charco de lava*. Perdiste tus cosas.',
    '🐻 Despertaste a un *oso hibernando* en la cueva y tuviste que huir tirando tu dinero.',
    '⛏️ Rompiste tu *pico de diamante* contra una piedra indestructible.'
];

// ==========================================
// DICCIONARIOS DE VARIEDAD (TALAR)
// ==========================================
const talaLegendaria = [
    '🌳 ¡MÍTICO! Talaste una rama del mismísimo *Árbol del Mundo (Yggdrasil)*.',
    '✨ Encontraste un claro oculto y talaste *Madera Élfica Brillante*.',
    '🌌 Cortaste un árbol que cayó del cielo: *Madera de Estrella Fugaz*.',
    '🔥 Talaste un *Roble de Fuego* que nunca se apaga.'
];
const talaEpica = [
    '🪵 ¡Qué fuerza! Talaste un gigantesco *Árbol de Caoba Antigua*.',
    '🌲 Conseguiste madera de un *Pino Milenario Místico*.',
    '🍂 Encontraste y cortaste un raro *Árbol de Arce Dorado*.',
    '🌳 Talaste madera de un *Roble Oscuro Encantado*.'
];
const talaNormal = [
    '🪵 Talaste un montón de *Madera de Roble* estándar.',
    '🌲 Cortaste varios *Pinos* para hacer tablas.',
    '🪵 Conseguiste buena cantidad de *Madera de Abedul*.',
    '🌿 Cortaste bambú y *Madera de Jungla*.',
    '🪵 Trabajaste duro y apilaste mucha *Leña para el invierno*.'
];
const talaBasura = [
    '🍂 Solo conseguiste un montón de *hojas secas*.',
    '🪵 Tu hacha resbaló y solo cortaste *ramas podridas*.',
    '🍄 Talaste un tronco que estaba lleno de *hongos venenosos*.',
    '🐦 Tiraste un árbol y solo había un *nido de pájaros vacío*.',
    '🪵 Cortaste la corteza y estaba llena de *termitas muertas*.'
];
const talaCastigo = [
    '🐝 ¡GOLPEASTE UN PANAL! Un enjambre de *abejas asesinas* te atacó. Pagaste la clínica.',
    '🪵 ¡CUIDADO! El árbol cayó hacia el lado equivocado y *te aplastó la pierna*.',
    '🪓 Golpeaste una piedra escondida y *rompiste tu hacha*.',
    '🐻 El ruido despertó a un *Oso pardo* que te persiguió por el bosque.',
    '👮‍♂️ Un guardabosques te atrapó *talando en zona protegida* y te multó.'
];

module.exports = {
    commands: ['pescar', 'minar', 'talar'],
    
    async execute(ctx) {
        const { sock, remoteJid, sender, command, db, reply, fromGroup } = ctx;

        if (!fromGroup) {
            return reply('❌ Estos comandos son más divertidos en grupos.');
        }

        const userKey = cleanJid(sender);
        if (enUso.has(userKey)) return;

        const userData = await db.getUser(userKey);
        const inv = await shop.getInventory(userKey);
        const now = Date.now();
        const cooldown = 5 * 60 * 1000; // 5 minutos

        // ==========================================
        // FUNCIÓN GENERAL DE FARMEO
        // ==========================================
        const procesarFarmeo = async (tipo, nombreComando, animacionIni, animacionFin, diccionarios, itemPro, emoji) => {
            const dbField = `last${tipo}`;
            const remaining = cooldown - (now - (userData[dbField] || 0));

            if (remaining > 0) {
                const m = Math.floor(remaining / 60000);
                const s = Math.floor((remaining % 60000) / 1000);
                return reply(`⏳ Aún estás descansando de tu última jornada. Espera *${m}m ${s}s* para volver a ${nombreComando}.`);
            }

            enUso.add(userKey);
            await db.setUser(userKey, { [dbField]: now });

            try {
                // BONO DE HERRAMIENTA PRO
                let mult = (inv[itemPro] || 0) > 0 ? 1.5 : 1;
                let aviso = mult > 1 ? `\n${emoji} *¡Tu Herramienta Profesional te dio un bono del 50%!*` : '';

                // ANIMACIÓN
                let msg = await sock.sendMessage(remoteJid, { text: animacionIni, mentions: [userKey] });
                await esperar(1500);
                try { await sock.sendMessage(remoteJid, { text: animacionFin, edit: msg.key, mentions: [userKey] }); } catch (e) {}
                await esperar(2000);

                // CÁLCULO DE PROBABILIDAD Y CRÍTICO
                let rand = Math.random() * 100;
                let critico = Math.random() < 0.10; // 10% de probabilidad de golpe crítico (x2)
                let premio = 0;
                let resultadoTxt = '';
                let textoCritico = critico ? `\n💥 *¡GOLPE CRÍTICO! Tu XP se ha duplicado.*` : '';

                if (rand < 5) { 
                    premio = Math.floor(randXP(4000, 6000) * mult); 
                    if (critico) premio *= 2;
                    resultadoTxt = `${pick(diccionarios.legendario)}${aviso}${textoCritico}\n💰 Ganaste *${premio} XP*.`;
                } else if (rand < 20) { 
                    premio = Math.floor(randXP(1500, 2500) * mult); 
                    if (critico) premio *= 2;
                    resultadoTxt = `${pick(diccionarios.epico)}${aviso}${textoCritico}\n💰 Ganaste *${premio} XP*.`;
                } else if (rand < 70) { 
                    premio = Math.floor(randXP(400, 1000) * mult); 
                    if (critico) premio *= 2;
                    resultadoTxt = `${pick(diccionarios.normal)}${aviso}${textoCritico}\n💰 Ganaste *${premio} XP*.`;
                } else if (rand < 90) { 
                    premio = 0;
                    resultadoTxt = `${pick(diccionarios.basura)}\n💸 No ganas nada de XP.`;
                } else { 
                    let castigo = randXP(500, 1000);
                    if ((userData.xp || 0) < castigo) castigo = userData.xp || 0; 
                    await db.removeXP(userKey, castigo);
                    resultadoTxt = `${pick(diccionarios.castigo)}\n❌ Perdiste *${castigo} XP*.`;
                }

                // 🐾 SINERGIA CON MASCOTAS
                if (premio > 0 && userData.pet) {
                    if (Math.random() < 0.25) { // 25% de que la mascota ayude
                        let bonoMascota = Math.floor(premio * 0.20); // Da 20% extra
                        premio += bonoMascota;
                        resultadoTxt += `\n✨ ¡Tu mascota *${userData.pet.name}* te ayudó y encontró *+${bonoMascota} XP* extra!`;
                    }
                }

                if (premio > 0) await db.addXP(userKey, premio);

                let finalMsg = `*RESULTADO DE ${nombreComando.toUpperCase()}* ${emoji}\n\n${resultadoTxt}\n👤 @${number(sender)}`;
                try { await sock.sendMessage(remoteJid, { text: finalMsg, edit: msg.key, mentions: [userKey] }); } 
                catch (e) { await sock.sendMessage(remoteJid, { text: finalMsg, mentions: [userKey] }); }
            } finally {
                enUso.delete(userKey);
            }
        };

        // ==========================================
        // RUTEO DE COMANDOS
        // ==========================================
        if (command === 'pescar') {
            await procesarFarmeo('Pescar', 'pesca', 
                `🎣 @${number(sender)} ha lanzado la caña al agua...`, 
                `🎣 @${number(sender)} siente un fuerte tirón... *¡Algo picó!*`, 
                { legendario: pescaLegendaria, epico: pescaEpica, normal: pescaNormal, basura: pescaBasura, castigo: pescaCastigo },
                'cana_pro', '🎣'
            );
        }

        if (command === 'minar') {
            await procesarFarmeo('Minar', 'minería', 
                `⛏️ @${number(sender)} encendió su antorcha y entró a la cueva oscura...`, 
                `⛏️ @${number(sender)} está picando una pared de piedra...\n\n*¡Clank! ¡Clank! ¡Clank!*`, 
                { legendario: minaLegendaria, epico: minaEpica, normal: minaNormal, basura: minaBasura, castigo: minaCastigo },
                'pico_pro', '⛏️'
            );
        }

        if (command === 'talar') {
            await procesarFarmeo('Talar', 'tala', 
                `🪓 @${number(sender)} camina hacia el espeso bosque buscando un buen árbol...`, 
                `🪓 @${number(sender)} levanta su hacha y comienza a golpear el tronco...\n\n*¡Chop! ¡Chop! ¡Chop!*`, 
                { legendario: talaLegendaria, epico: talaEpica, normal: talaNormal, basura: talaBasura, castigo: talaCastigo },
                'hacha_pro', '🪓'
            );
        }
    }
};
