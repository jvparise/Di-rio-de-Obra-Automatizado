const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const { criarDiario } = require('./criar_diario');
const { gerarRelatorio: gerarRelatorioTexto } = require('./relatorio_semanal');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const MEDIA_DIR = path.join(__dirname, 'media');
const AUTH_DIR = path.join(__dirname, 'auth');
const QR_PATH = path.join(__dirname, 'qrcode.png');

if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR);
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR);

// Sessões ativas: groupId -> { dados, fotos, timer }
const sessoes = {};
const TEMPO_ESPERA_MS = 2 * 60 * 1000;

function parseMensagem(texto) {
    const dados = { workers: {} };
    let encontrou_obra = false;
    let modoDescricao = false;
    let linhasDescricao = [];

    for (const linha of (texto || '').split('\n')) {
        const sep = linha.indexOf(':');
        const chaveRaw = sep !== -1 ? linha.substring(0, sep).trim().toUpperCase() : '';
        const valor = sep !== -1 ? linha.substring(sep + 1).trim() : '';

        const ehChaveConhecida = ['OBRA', 'TEMPO', 'DESCRICAO', 'DESCRIÇÃO'].includes(chaveRaw);
        const ehWorker = chaveRaw && !isNaN(parseInt(valor)) && valor !== '';

        if (ehChaveConhecida || ehWorker) {
            modoDescricao = false;
            if (chaveRaw === 'OBRA') { dados.obra = valor; encontrou_obra = true; }
            else if (chaveRaw === 'TEMPO') dados.tempo = valor;
            else if (chaveRaw === 'DESCRICAO' || chaveRaw === 'DESCRIÇÃO') {
                modoDescricao = true;
                if (valor) linhasDescricao.push(valor);
            }
            else if (ehWorker) dados.workers[chaveRaw] = parseInt(valor);
        } else if (modoDescricao && linha.trim()) {
            linhasDescricao.push(linha.trim());
        }
    }

    if (linhasDescricao.length > 0) dados.descricao = linhasDescricao.join('\n');
    return encontrou_obra ? dados : null;
}

async function gerarRelatorio(sock, jid) {
    const texto = await gerarRelatorioTexto(config.base_obras);
    await sock.sendMessage(jid, { text: texto });
}

async function processarSessao(sock, groupId) {
    const sessao = sessoes[groupId];
    if (!sessao) return;
    delete sessoes[groupId];

    const jid = groupId;
    try {
        const r = await criarDiario(sessao.dados, sessao.fotos, config);
        for (const foto of sessao.fotos) { try { fs.unlinkSync(foto); } catch (_) {} }

        if (r.sucesso) {
            const pdfInfo = r.pdf ? `\n📄 PDF gerado!` : '';
            await sock.sendMessage(jid, { text: `✅ *Diário criado!*\n📁 ${r.pasta}\n📸 Fotos: ${r.fotos}${pdfInfo}` });
        } else {
            await sock.sendMessage(jid, { text: `❌ Erro: ${r.erro}` });
        }
    } catch (e) {
        for (const foto of sessao.fotos) { try { fs.unlinkSync(foto); } catch (_) {} }
        await sock.sendMessage(jid, { text: `❌ Erro ao criar diário:\n${String(e).substring(0, 300)}` });
    }
}

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({ auth: state, printQRInTerminal: false });

    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            await QRCode.toFile(QR_PATH, qr, { width: 400 });
            exec(`start "" "${QR_PATH}"`);
            console.log('✅ QR code salvo e aberto em: ' + QR_PATH);
            console.log('Escaneie com WhatsApp > Dispositivos conectados > Conectar dispositivo');
        }

        if (connection === 'open') {
            console.log('✅ Bot conectado ao WhatsApp!');
            if (fs.existsSync(QR_PATH)) fs.unlinkSync(QR_PATH);
        }

        if (connection === 'close') {
            const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
            if (loggedOut) {
                console.log('Sessão encerrada pelo usuário. Escaneie o QR code novamente.');
                process.exit(1);
            } else {
                console.log('Conexão perdida. PM2 vai reiniciar em instantes...');
                process.exit(0);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.message) continue;
            // Ignora apenas respostas automáticas do próprio bot (evita loop)
            const ehRespostaBot = msg.key.fromMe && (
                (msg.message.conversation || '').startsWith('📋') ||
                (msg.message.conversation || '').startsWith('✅') ||
                (msg.message.conversation || '').startsWith('📸') ||
                (msg.message.conversation || '').startsWith('⏳') ||
                (msg.message.conversation || '').startsWith('❌')
            );
            if (ehRespostaBot) continue;

            const jid = msg.key.remoteJid;
            console.log('MSG de:', jid, '| tipos:', JSON.stringify(Object.keys(msg.message)));

            if (!jid?.endsWith('@g.us')) continue; // só grupos

            const texto = msg.message.conversation
                || msg.message.extendedTextMessage?.text
                || msg.message.imageMessage?.caption
                || '';

            console.log('Grupo MSG [' + jid + ']:', JSON.stringify(texto.substring(0, 100)));

            // Comando RELATORIO
            if (texto.trim().toUpperCase() === 'RELATORIO' || texto.trim().toUpperCase() === 'RELATÓRIO') {
                await sock.sendMessage(jid, { text: '⏳ Gerando relatório semanal...' });
                await gerarRelatorio(sock, jid);
                continue;
            }

            // Comando PRONTO
            if (texto.trim().toUpperCase() === 'PRONTO' && sessoes[jid]) {
                clearTimeout(sessoes[jid].timer);
                await sock.sendMessage(jid, { text: '⏳ Processando diário...' });
                await processarSessao(sock, jid);
                continue;
            }

            // Mensagem de diário
            const dados = parseMensagem(texto);
            if (dados) {
                if (sessoes[jid]?.timer) clearTimeout(sessoes[jid].timer);
                sessoes[jid] = { dados, fotos: [], timer: null };

                // Foto na mesma mensagem (como legenda)
                if (msg.message.imageMessage) {
                    try {
                        const buffer = await downloadMediaMessage(msg, 'buffer', {});
                        const nome = path.join(MEDIA_DIR, `${Date.now()}.jpg`);
                        fs.writeFileSync(nome, buffer);
                        sessoes[jid].fotos.push(nome);
                    } catch (_) {}
                }

                sessoes[jid].timer = setTimeout(() => processarSessao(sock, jid), TEMPO_ESPERA_MS);

                await sock.sendMessage(jid, {
                    text: `📋 *Diário recebido!*\n🏗️ Obra: ${dados.obra}\n📸 Fotos: ${sessoes[jid].fotos.length}\n\nEnvie as fotos e mande *PRONTO* quando terminar (ou aguarde 2 min).`
                });
                continue;
            }

            // Foto avulsa para sessão ativa
            if (msg.message.imageMessage && sessoes[jid]) {
                try {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    const nome = path.join(MEDIA_DIR, `${Date.now()}.jpg`);
                    fs.writeFileSync(nome, buffer);
                    sessoes[jid].fotos.push(nome);

                    clearTimeout(sessoes[jid].timer);
                    sessoes[jid].timer = setTimeout(() => processarSessao(sock, jid), TEMPO_ESPERA_MS);

                    const n = sessoes[jid].fotos.length;
                    await sock.sendMessage(jid, { text: `📸 Foto ${n} recebida!` });
                } catch (_) {}
            }
        }
    });
}

iniciarBot();
