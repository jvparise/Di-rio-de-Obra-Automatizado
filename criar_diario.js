const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MESES = {
    1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
    5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
    9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
};

const TEMPO_TEXTO = {
    'BOM':           'BOM ( X )                 CHUVOSO (   )            CHUVA INTENSA (   )',
    'CHUVOSO':       'BOM (   )                 CHUVOSO ( X )            CHUVA INTENSA (   )',
    'CHUVA INTENSA': 'BOM (   )                 CHUVOSO (   )            CHUVA INTENSA ( X )',
};

const WORKERS_ESQUERDA = {
    'MESTRE DE OBRA': 43, 'ENCARREGADO': 44, 'ALMOXARIFE': 45,
    'ENCARREGADO ADM': 46, 'AUX. ADM': 47, 'TEC. SEGURANCA': 48,
    'ENGENHEIRO': 49, 'ESTAGIARIO': 50, 'AUX. TECNICO': 51,
    'VIGIA': 52, 'SERRALHEIRO': 53,
};

const WORKERS_DIREITA = {
    'AJUDANTE COMUM': 43, 'CARPINTEIRO': 44, 'ENCANADOR': 45,
    'AJUDANTE PRATICO': 46, 'ELETRICISTA': 47, 'MONTADOR DE ANDAIME': 48,
    'PEDREIRO': 49, 'OPERADOR DE BETONEIRA': 50,
    'OPERADOR DE RETROESCAVADEIRA': 51, 'ARMADOR': 52,
    'PINTOR': 53, 'GESSEIRO': 54,
};

function gerarPDF(excelPath, sheetName, pdfPath) {
    return new Promise((resolve) => {
        const esc = s => s.replace(/'/g, "''");
        const psScript = [
            `$excel = New-Object -ComObject Excel.Application`,
            `$excel.Visible = $false`,
            `$excel.DisplayAlerts = $false`,
            `$wb = $excel.Workbooks.Open('${esc(excelPath)}')`,
            `$ws = $wb.Worksheets('${esc(sheetName)}')`,
            `$ws.ExportAsFixedFormat(0, '${esc(pdfPath)}')`,
            `$wb.Close($false)`,
            `$excel.Quit()`,
        ].join('; ');

        const proc = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
        proc.on('close', () => resolve(fs.existsSync(pdfPath) ? pdfPath : null));
    });
}

async function criarDiario(dados, fotos, config) {
    const hoje = new Date();
    const dia = hoje.getDate();
    const mes = hoje.getMonth() + 1;
    const ano = hoje.getFullYear();
    const dataStr = `${String(dia).padStart(2, '0')}-${String(mes).padStart(2, '0')}-${ano}`;
    const mesNome = MESES[mes];
    const sheetName = String(dia).padStart(2, '0');

    const obra = (dados.obra || 'Obra').trim();
    const pastaDia = path.join(config.base_obras, obra, String(ano), mesNome, dataStr);
    fs.mkdirSync(pastaDia, { recursive: true });

    const nomeExcel = `Diario Obra ${obra}.xlsx`;
    const caminhoExcel = path.join(pastaDia, nomeExcel);
    fs.copyFileSync(config.template_path, caminhoExcel);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(caminhoExcel);

    const ws = workbook.getWorksheet(sheetName);
    if (!ws) {
        return { sucesso: false, erro: `Aba ${sheetName} não encontrada no template.` };
    }

    ws.getCell('A7').value = `OBRA: ${obra}`;
    ws.getCell('I7').value = dataStr;
    if (config.empresa) ws.getCell('A9').value = `EMPRESA EXECUTORA: ${config.empresa}`;
    if (config.engenheiro_responsavel) ws.getCell('A10').value = `ENGENHEIRO RESPONSÁVEL: ${config.engenheiro_responsavel}`;

    const descricao = (dados.descricao || '').trim();
    if (descricao) {
        descricao.split('\n').slice(0, 20).forEach((linha, i) => {
            const row = 12 + i;
            if (row <= 32) ws.getCell(row, 1).value = linha.trim();
        });
    }

    const tempo = (dados.tempo || 'BOM').toUpperCase().trim();
    ws.getCell(34, 1).value = TEMPO_TEXTO[tempo] || TEMPO_TEXTO['BOM'];

    for (const [nome, qtd] of Object.entries(dados.workers || {})) {
        const nomeUpper = nome.toUpperCase().trim();
        const qtdInt = parseInt(qtd);
        if (isNaN(qtdInt)) continue;

        if (WORKERS_ESQUERDA[nomeUpper] !== undefined) {
            ws.getCell(WORKERS_ESQUERDA[nomeUpper], 3).value = qtdInt;
        } else if (WORKERS_DIREITA[nomeUpper] !== undefined) {
            ws.getCell(WORKERS_DIREITA[nomeUpper], 8).value = qtdInt;
        }
    }

    await workbook.xlsx.writeFile(caminhoExcel);

    const caminhoPdf = caminhoExcel.replace('.xlsx', '.pdf');
    const pdfGerado = await gerarPDF(caminhoExcel, sheetName, caminhoPdf);

    let fotosCopiadas = 0;
    for (let i = 0; i < fotos.length; i++) {
        if (fs.existsSync(fotos[i])) {
            const ext = path.extname(fotos[i]).toLowerCase() || '.jpg';
            fs.copyFileSync(fotos[i], path.join(pastaDia, `foto_${String(i + 1).padStart(2, '0')}${ext}`));
            fotosCopiadas++;
        }
    }

    return { sucesso: true, pasta: pastaDia, excel: caminhoExcel, pdf: pdfGerado, fotos: fotosCopiadas };
}

module.exports = { criarDiario };
