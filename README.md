# DiarioBot — Automação de Diário de Obra via WhatsApp

Bot que recebe mensagens de um grupo WhatsApp e cria automaticamente a pasta do dia com a planilha Excel preenchida e as fotos da obra.

## Requisitos

- [Node.js](https://nodejs.org) (v18+)
- [Python 3.11+](https://python.org)
- Google Chrome instalado

## Instalação

1. Clone o repositório:
```
git clone https://github.com/seu-usuario/DiarioBot.git
cd DiarioBot
```

2. Instale as dependências Node.js:
```
npm install
```

3. Instale a dependência Python:
```
python -m pip install openpyxl
```

4. Configure o `config.json` com os caminhos da sua máquina:
```json
{
  "python_path": "C:\\caminho\\para\\python.exe",
  "base_obras": "C:\\caminho\\para\\pasta\\Obras",
  "template_path": "C:\\caminho\\para\\DiarioBot\\template\\template.xlsx",
  "bot_dir": "C:\\caminho\\para\\DiarioBot"
}
```

5. Coloque seu modelo de planilha em `template/template.xlsx`

6. Inicie o bot:
```
node bot.js
```

7. Escaneie o QR code que abrir com o WhatsApp (Dispositivos conectados → Conectar dispositivo)

## Como usar

Mande no grupo WhatsApp:
```
OBRA: Nome da Obra
TEMPO: BOM
ENGENHEIRO: 1
PEDREIRO: 3
AJUDANTE COMUM: 2
DESCRICAO:
Atividade 1
Atividade 2
```

Mande as fotos e depois **PRONTO**.

## Início automático (Windows)

Execute uma vez como administrador:
```
schtasks /create /tn "DiarioObra_Bot" /tr "%CD%\iniciar_bot.bat" /sc onlogon /ru %USERNAME%
```
