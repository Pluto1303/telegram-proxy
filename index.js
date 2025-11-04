import express from "express";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// 🔧 Configurações principais
const PORT = process.env.PORT || 10000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8462588145:AAGRhcJ7eJimORSuvGue4B55i4-0KT_swBQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1001893986630";
const JIRA_EMAIL = process.env.JIRA_EMAIL || "carlos.monteiro@grupomateus.com.br";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "SEU_TOKEN_API_AQUI";
const JIRA_BASE_URL = "https://grupomateus.atlassian.net";

// 🧠 Banco temporário de monitoramento (memória)
let monitorados = {};

// 📨 Enviar mensagem ao Telegram
async function sendTelegramMessage(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown"
    });
  } catch (err) {
    console.error("Erro ao enviar mensagem ao Telegram:", err.response?.data || err.message);
  }
}

// 🔍 Buscar informações do chamado Jira (usando ServiceDesk API)
async function getJiraTicketStatus(issueKey) {
  const headers = {
    "Authorization": `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
    "Accept": "application/json"
  };

  try {
    const url = `${JIRA_BASE_URL}/rest/servicedeskapi/request/${issueKey}`;
    const response = await axios.get(url, { headers });
    const data = response.data;

    const summary = data.summary || "Sem título";
    const status = data.currentStatus?.status || "Desconhecido";

    console.log(`✅ Dados Jira obtidos (${issueKey}): ${summary} - ${status}`);
    return { summary, status };

  } catch (err) {
    console.error("❌ Erro ao buscar chamado Jira:", err.response?.statusText || err.message);
    return null;
  }
}

// ⏱️ Monitorar mudanças de status
async function monitorarChamados() {
  for (const issueKey in monitorados) {
    const info = monitorados[issueKey];
    const novo = await getJiraTicketStatus(issueKey);

    if (novo && novo.status !== info.statusAnterior) {
      const emoji =
        novo.status.toLowerCase().includes("cancelado") ? "❌" :
        novo.status.toLowerCase().includes("aguardando") ? "⏳" :
        novo.status.toLowerCase().includes("andamento") ? "🛠️" :
        novo.status.toLowerCase().includes("feito") ? "✅" :
        "📄";

      await sendTelegramMessage(
        `${emoji} O chamado *${novo.summary}* (${issueKey}) mudou de status!\n\n📊 *${info.statusAnterior}* → *${novo.status}*`
      );

      monitorados[issueKey].statusAnterior = novo.status;
    }
  }
}

// 🔄 Executar a cada 2 minutos
setInterval(monitorarChamados, 2 * 60 * 1000);

// 📥 Receber mensagens do Telegram
app.post("/", async (req, res) => {
  console.log("📩 Dados recebidos do Telegram:", JSON.stringify(req.body, null, 2));

  const message = req.body?.message?.text;
  if (!message) return res.sendStatus(200);

  const jiraRegex = /SUPORTE-\d+/i;
  const match = message.match(jiraRegex);

  if (match) {
    const issueKey = match[0];
    const chamado = await getJiraTicketStatus(issueKey);

    if (chamado) {
      monitorados[issueKey] = {
        statusAnterior: chamado.status,
        summary: chamado.summary
      };

      await sendTelegramMessage(
        `📡 *Recebi o chamado Jira:*\nhttps://grupomateus.atlassian.net/browse/${issueKey}\n\n📝 *${chamado.summary}*\n🔍 *Status atual:* ${chamado.status}\n\nVou monitorar e avisar quando houver mudanças.`
      );
    } else {
      await sendTelegramMessage(`⚠️ Não consegui consultar o chamado *${issueKey}*. Verifique se o link está correto ou se tenho acesso.`);
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
