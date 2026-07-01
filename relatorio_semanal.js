const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const MESES = {
    1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
    5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
    9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
};

const WORKERS_ESQUERDA = {
    'MESTRE DE OBRA': 43, 'ENCARREGADO': 44, 'ALMOXARIFE': 45,
    'ENCARREGADO ADM': 46, 'AUX. ADM': 47, 'TEC. SEGURANÇA': 48,
    'ENGENHEIRO': 49, 'ESTAGIÁRIO': 50, 'AUX. TÉCNICO': 51,
    'VIGIA': 52, 'SERRALHEIRO': 53,
};

const WORKERS_DIREITA = {
    'AJUDANTE COMUM': 43, 'CARPINTEIRO': 44, 'ENCANADOR': 45,
    'AJUDANTE PRÁTICO': 46, 'ELETRICISTA': 47, 'MONTADOR DE ANDAIME': 48,
    'PEDREIRO': 49, 'OP. BETONEIRA': 50,
    'OP. RETROESCAVADEIRA': 51, 'ARMADOR': 52,
    'PINTOR': 53, 'GESSEIRO': 54,
};

function datasSemanana() {
    const hoje = new Date();
    const diaSemana = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1; // seg=0, dom=6
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() - diaSemana);
    segunda.setHours(0, 0, 0, 0);

    const datas = [];
    for (let i = 0; i <= diaSemana; i++) {
        const d = new Date(segunda);
        d.setDate(segunda.getDate() + i);
        datas.push(d);
    }
    return datas;
}

async function lerDia(caminhoExcel, sheetName) {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(caminhoExcel);
        const ws = workbook.getWorksheet(sheetName);
        if (!ws) return null;

        const obraRaw = String(ws.getCell('A7').value || '');
        const obra = obraRaw.replace('OBRA:', '').trim();

        const atividades = [];
        for (let row = 12; row <= 32; row++) {
            const val = ws.getCell(row, 1).value;
            if (val && String(val).trim()) atividades.push(String(val).trim());
        }

        const workers = {};
        for (const [nome, row] of Object.entries(WORKERS_ESQUERDA)) {
            const val = ws.getCell(row, 3).value;
            const n = parseInt(val);
            if (!isNaN(n) && n > 0) workers[nome] = n;
        }
        for (const [nome, row] of Object.entries(WORKERS_DIREITA)) {
            const val = ws.getCell(row, 8).value;
            const n = parseInt(val);
            if (!isNaN(n) && n > 0) workers[nome] = n;
        }

        return { obra, atividades, workers };
    } catch (_) {
        return null;
    }
}

async function gerarRelatorio(baseObras) {
    const datas = datasSemanana();
    const segunda = datas[0];
    const hoje = datas[datas.length - 1];

    const relatorio = {};

    for (const data of datas) {
        const dia = data.getDate();
        const mes = data.getMonth() + 1;
        const ano = data.getFullYear();
        const dataStr = `${String(dia).padStart(2, '0')}-${String(mes).padStart(2, '0')}-${ano}`;
        const mesNome = MESES[mes];
        const sheetName = String(dia).padStart(2, '0');

        if (!fs.existsSync(baseObras)) continue;

        for (const obraNome of fs.readdirSync(baseObras)) {
            const pastaDia = path.join(baseObras, obraNome, String(ano), mesNome, dataStr);
            if (!fs.existsSync(pastaDia)) continue;

            const xlsxFiles = fs.readdirSync(pastaDia).filter(f => f.endsWith('.xlsx'));
            if (xlsxFiles.length === 0) continue;

            const dados = await lerDia(path.join(pastaDia, xlsxFiles[0]), sheetName);
            if (!dados) continue;

            if (!relatorio[obraNome]) relatorio[obraNome] = [];
            relatorio[obraNome].push({ data: dataStr, atividades: dados.atividades, workers: dados.workers });
        }
    }

    if (Object.keys(relatorio).length === 0) {
        return '📊 Nenhum diário encontrado nesta semana.';
    }

    const fmt = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const linhas = [
        `📊 *RELATÓRIO SEMANAL*`,
        `Semana: ${fmt(segunda)} a ${fmt(hoje)}/${hoje.getFullYear()}`,
        ''
    ];

    for (const [obraNome, dias] of Object.entries(relatorio)) {
        linhas.push(`🏗️ *${obraNome}*`);
        linhas.push(`📅 Dias registrados: ${dias.length}`);

        const totalWorkers = {};
        for (const dia of dias) {
            for (const [w, q] of Object.entries(dia.workers)) {
                totalWorkers[w] = (totalWorkers[w] || 0) + q;
            }
        }

        if (Object.keys(totalWorkers).length > 0) {
            linhas.push('👷 Equipe (total semana):');
            for (const [w, q] of Object.entries(totalWorkers)) {
                linhas.push(`  - ${w}: ${q}`);
            }
        }

        linhas.push('📋 Atividades:');
        for (const dia of dias) {
            linhas.push(`  *${dia.data}*`);
            dia.atividades.slice(0, 3).forEach(at => linhas.push(`  • ${at}`));
            if (dia.atividades.length > 3) linhas.push(`  • ... +${dia.atividades.length - 3} atividades`);
        }
        linhas.push('');
    }

    return linhas.join('\n');
}

module.exports = { gerarRelatorio };
