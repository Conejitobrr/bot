'use strict';

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let shop;
try { shop = require('../lib/shop'); } catch (e) { shop = { getInventory: async () => ({}) }; }

// 🔥 CANDADO ANTI-SPAM
const enUso = new Set();

function cleanJid(jid = '') { return String(jid).split(':')[0]; }
function number(jid = '') { return cleanJid(jid).split('@')[0].replace(/\D/g, ''); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randXP(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ==========================================
// 🎣 DICCIONARIOS DE PESCA (AMPLIADOS)
// ==========================================
const pescaLegendaria = [
    '🦈 ¡INCREÍBLE! Pescaste un *Megalodón* y lo vendiste en el mercado negro.',
    '🏴‍☠️ ¡Pesca histórica! Enganchaste un *Cofre Pirata* lleno de joyas antiguas.',
    '🧜‍♀️ ¡Wow! Una *Sirena* se enredó en tu red y te pagó con perlas para que la liberes.',
    '🐉 Pescaste al mismísimo *Monstruo del Lago Ness* y los periódicos te pagaron millones.',
    '🦑 ¡Despertaste al *Kraken*! Lograste cortarle un tentáculo antes de huir.',
    '🔱 Encontraste el *Tridente perdido de Poseidón* enterrado en el fondo.',
    '✨ Pescaste un mítico *Pez Koi Dorado*. Dicen que trae buena fortuna infinita.'
];
const pescaEpica = [
    '🐡 ¡Genial! Pescaste un raro *Pez Globo Dorado*.',
    '🐟 ¡Qué fuerza! Lograste sacar un *Atún Aleta Amarilla* gigante.',
    '⚔️ Luchaste por horas y pescaste un enorme *Pez Espada*.',
    '🦑 Pescaste un *Calamar Gigante* que casi hunde tu bote.',
    '🌊 Lograste capturar una *Mantarraya Majestuosa*.',
    '🐢 Rescataste una *Tortuga Milenaria* y descubriste un tesoro bajo su caparazón.',
    '🐬 Un *Delfín* amistoso te guió hacia un banco de peces exóticos.'
];
const pescaNormal = [
    '🐟 Pescaste un hermoso *Salmón* para la cena.',
    '🐠 Conseguiste una buena *Corvina* fresca.',
    '🐟 Pescaste un *Bonito* de buen tamaño.',
    '🐡 Atrapaste un montón de *Pejerreyes*.',
    '🐟 Sacaste una *Trucha* de río muy apetitosa.',
    '🐠 Pescaste una *Tilapia* promedio.',
    '🦀 Lograste atrapar un *Cangrejo Ermitaño* bastante grande.',
    '🦞 Enganchaste una jugosa *Langosta*.',
    '🐠 Pescaste un simpático *Pez Payaso*.'
];
const pescaBasura = [
    '🥾 Qué asco... Pescaste una *bota vieja y apestosa*.',
    '🛞 Enganchaste una *llanta pinchada* llena de lodo.',
    '🌿 Solo sacaste un montón de *algas enredadas*.',
    '🩲 Pescaste un *calzoncillo mojado* de alguien más... qué asco.',
    '🍾 Enganchaste una *botella de plástico* vacía. Al menos limpiaste el mar.',
    '🥫 Pescaste una *lata de atún oxidada*.',
    '🕶️ Sacaste unas *gafas de sol rotas* cubiertas de musgo.'
];
const pescaCastigo = [
    '🐊 ¡CUIDADO! Un *cocodrilo* salió del agua y te mordió. Pagaste medicinas.',
    '🦈 Un *tiburón* saltó, se comió tu pesca y rompió tu caña carísima.',
    '🌊 Te resbalaste, caíste al agua y *perdiste tu billetera*.',
    '🦅 Un *pelícano gigante* te atacó y se robó lo que habías pescado.',
    '👮‍♂️ La policía marítima te multó por *pescar sin licencia*.',
    '🐡 Pescaste un pez venenoso y te picó. Tuviste que ir al hospital.',
    '⚓ Tu anzuelo se atascó en una roca y *perdiste todo tu equipo*.'
];

// ==========================================
// ⛏️ DICCIONARIOS DE MINERÍA (AMPLIADOS)
// ==========================================
const minaLegendaria = [
    '💎 ¡JACKPOT! Encontraste un gigantesco *Diamante Brillante*.',
    '🛸 ¡Increíble! Picaste un *Meteorito Alienígena* que vale una fortuna.',
    '🟢 Encontraste una *Esmeralda* del tamaño de un melón.',
    '🔴 Picaste la pared y descubriste la mítica *Gema del Infinito*.',
    '🦖 Desenterraste un *Fósil de T-Rex* intacto. Los museos te pagaron millones.',
    '🛡️ Descubriste una veta del legendario mineral *Vibranium*.',
    '🥚 Encontraste un antiguo *Huevo de Dragón* petrificado en la roca.'
];
const minaEpica = [
    '🥇 ¡Excelente! Rompiste la piedra y sacaste un *Lingote de Oro puro*.',
    '🔮 Encontraste una cueva oculta llena de *Zafiros Azules*.',
    '💎 Extraíste una hermosa *Geoda de Amatista*.',
    '🔥 Encontraste *Magma Cristalizada* súper rara.',
    '💍 Picaste justo en un yacimiento de *Platino*.',
    '🔴 Encontraste un misterioso *Rubí de Sangre* pulsante.',
    '✨ Extraíste *Polvo Estelar* de una roca subterránea.'
];
const minaNormal = [
    '🪨 Trabajaste duro y recolectaste bastante *Carbón y Hierro*.',
    '🥉 Lograste extraer varios kilos de *Cobre*.',
    '✨ Encontraste polvo de *Redstone* luminoso.',
    '🔵 Extraíste un poco de *Lapislázuli* para encantamientos.',
    '🪨 Picaste un buen rato y sacaste mucha *Piedra y Cuarzo*.',
    '🧂 Encontraste un gran depósito de *Sal de Mina*.',
    '🧱 Lograste picar un montón de *Granito* útil.'
];
const minaBasura = [
    '🕸️ Picaste en el lugar equivocado. Solo había *telarañas y polvo*.',
    '🦴 Desenterraste unos *huesos viejos* de perro.',
    '🪨 Picaste y picaste pero solo sacaste *grava inútil*.',
    '⛏️ Solo encontraste *tierra mojada* y gusanos.',
    '🦇 Te metiste a una cueva vacía que solo olía a *guano de murciélago*.',
    '🐀 Un montón de *ratas subterráneas* huyeron cuando rompiste la roca.',
    '🌱 Solo encontraste *raíces secas* atravesando la tierra.'
];
const minaCastigo = [
    '💥 ¡DERRUMBE! Un pedazo de techo te cayó en la cabeza. Pagaste el hospital.',
    '🧨 Picaste donde no debías y *explotó un Creeper* en tu cara.',
    '🌋 Resbalaste y *te caíste a un charco de lava*. Perdiste tus cosas.',
    '🐻 Despertaste a un *oso hibernando* en la cueva y tuviste que huir tirando tu dinero.',
    '⛏️ Rompiste tu *pico de diamante* contra una piedra indestructible.',
    '☠️ Rompiste una bolsa de *gas tóxico* subterráneo. Pagaste el tratamiento médico.',
    '💧 ¡Inundación! Picaste la pared equivocada y *un río subterráneo te arrastró*.'
];

// ==========================================
// 🪓 DICCIONARIOS DE TALAR (AMPLIADOS)
// ==========================================
const talaLegendaria = [
    '🌳 ¡MÍTICO! Talaste una rama del mismísimo *Árbol del Mundo (Yggdrasil)*.',
    '✨ Encontraste un claro oculto y talaste *Madera Élfica Brillante*.',
    '🌌 Cortaste un árbol que cayó del cielo: *Madera de Estrella Fugaz*.',
    '🔥 Talaste un *Roble de Fuego* que nunca se apaga.',
    '🍏 Lograste conseguir un fragmento del *Árbol del Edén*.',
    '💎 Encontraste un rarísimo *Árbol de Cristal* y vendiste sus ramas.',
    '🐉 Talaste un árbol que tenía escamas en lugar de corteza: *Madera de Dragón*.'
];
const talaEpica = [
    '🪵 ¡Qué fuerza! Talaste un gigantesco *Árbol de Caoba Antigua*.',
    '🌲 Conseguiste madera de un *Pino Milenario Místico*.',
    '🍂 Encontraste y cortaste un raro *Árbol de Arce Dorado*.',
    '🌳 Talaste madera de un *Roble Oscuro Encantado*.',
    '🌸 Lograste talar un hermoso *Cerezo Mágico* que nunca pierde sus flores.',
    '🎋 Encontraste un bosque oculto y cortaste *Bambú de Jade*.',
    '🌲 Talaste la rama perfecta de una *Secuoya Gigante*.'
];
const talaNormal = [
    '🪵 Talaste un montón de *Madera de Roble* estándar.',
    '🌲 Cortaste varios *Pinos* para hacer tablas.',
    '🪵 Conseguiste buena cantidad de *Madera de Abedul*.',
    '🌿 Cortaste bambú y *Madera de Jungla*.',
    '🪵 Trabajaste duro y apilaste mucha *Leña para el invierno*.',
    '🍎 Talaste un viejo *Manzano* y aprovechaste la madera.',
    '🌴 Cortaste una *Palmera* y guardaste los cocos.'
];
const talaBasura = [
    '🍂 Solo conseguiste un montón de *hojas secas*.',
    '🪵 Tu hacha resbaló y solo cortaste *ramas podridas*.',
    '🍄 Talaste un tronco que estaba lleno de *hongos venenosos*.',
    '🐦 Tiraste un árbol y solo había un *nido de pájaros vacío*.',
    '🪵 Cortaste la corteza y estaba llena de *termitas muertas*.',
    '🕸️ El árbol estaba hueco y solo tenía *telarañas enormes*.',
    '🌿 Te pasaste una hora cortando una *enredadera inútil*.'
];
const talaCastigo = [
    '🐝 ¡GOLPEASTE UN PANAL! Un enjambre de *abejas asesinas* te atacó. Pagaste la clínica.',
    '🪵 ¡CUIDADO! El árbol cayó hacia el lado equivocado y *te aplastó la pierna*.',
    '🪓 Golpeaste una piedra escondida y *rompiste tu hacha*.',
    '🐻 El ruido despertó a un *Oso pardo* que te persiguió por el bosque.',
    '👮‍♂️ Un guardabosques te atrapó *talando en zona protegida* y te multó.',
    '🐍 Una *serpiente venenosa* cayó de una rama y te mordió el cuello.',
    '💥 Resulta que era un *Ent (Árbol viviente)* y te dio una paliza por golpearlo.'
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
        
        // Carga de inventario segura
        let inv = {};
        try { inv = await shop.getInventory(userKey); } catch (e) { inv = {}; }
        
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
                    resultadoTxt = `${pick(diccionarios.legendario)}${aviso}${textoCritico}\n💰 Ganaste *${premio.toLocaleString()} XP*.`;
                } else if (rand < 20) { 
                    premio = Math.floor(randXP(1500, 2500) * mult); 
                    if (critico) premio *= 2;
                    resultadoTxt = `${pick(diccionarios.epico)}${aviso}${textoCritico}\n💰 Ganaste *${premio.toLocaleString()} XP*.`;
                } else if (rand < 70) { 
                    premio = Math.floor(randXP(400, 1000) * mult); 
                    if (critico) premio *= 2;
                    resultadoTxt = `${pick(diccionarios.normal)}${aviso}${textoCritico}\n💰 Ganaste *${premio.toLocaleString()} XP*.`;
                } else if (rand < 90) { 
                    premio = 0;
                    resultadoTxt = `${pick(diccionarios.basura)}\n💸 No ganas nada de XP.`;
                } else { 
                    let castigo = randXP(500, 1000);
                    if ((userData.xp || 0) < castigo) castigo = userData.xp || 0; 
                    await db.removeXP(userKey, castigo);
                    resultadoTxt = `${pick(diccionarios.castigo)}\n❌ Perdiste *${castigo.toLocaleString()} XP*.`;
                }

                // 🐾 SINERGIA CON MASCOTAS (Seguro contra crasheos si no hay mascota)
                if (premio > 0 && userData.pet && userData.pet.name) {
                    if (Math.random() < 0.25) { // 25% de que la mascota ayude
                        let bonoMascota = Math.floor(premio * 0.20); // Da 20% extra
                        premio += bonoMascota;
                        resultadoTxt += `\n✨ ¡Tu mascota *${userData.pet.name}* te ayudó y encontró *+${bonoMascota.toLocaleString()} XP* extra!`;
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
