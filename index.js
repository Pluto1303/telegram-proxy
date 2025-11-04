// index.js — Bot Telegram + Jira Service Management Monitor
import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

// ⚙️ Configurações principais
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "8462588145:AAGRhcJ7eJimORSuvGue4B55i4-0KT_swBQ";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1001893986630";
const JIRA_EMAIL = process.env.JIRA_EMAIL || "carlos.monteiro@grupomateus.com.br";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "SEU_TOKEN_API_AQUI";
const JIRA_BASE_URL = "https://grupomateus.atlassian.net";

// 📦 Memória temporária (mantém os status dos chamados)
const monitoredTickets = new Map();

// 🧩 Função para enviar mensagem no Telegram
async function sendTelegramMessage(text) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
  });
}

// 🔍 Função para obter informações do chamado Jira (API do portal)
async function getJiraTicketStatus(issueKey) {
  try {
    const issueUrl = `${JIRA_BASE_URL}/rest/servicedeskapi/request/${issueKey}`;
    const response = await axios.get(issueUrl, {
      headers: {
        "Authorization": `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
        "Accept": "application/json",
        "X-Atlassian-Token": "no-check"
      }
    });

    const data = response.data;
    const status = data.currentStatus?.name || "Desconhecido";
    const summary = data.requestFieldValues?.find(f => f.fieldId === "summary")?.value || "Sem título";
    return { status, summary };

  } catch (err) {
    console.error("Erro ao buscar chamado Jira:", err.response?.statusText || err.message);
    return null;
  }
}

// ♻️ Função para monitorar chamados em intervalo
async function monitorTickets() {
  for (const [issueKey, lastStatus] of monitoredTickets.entries()) {
    const info = await getJiraTicketStatus(issueKey);
    if (!info) continue;

    if (info.status !== lastStatus) {
      monitoredTickets.set(issueKey, info.status);
      let emoji = "ℹ️";

      if (/cancelado/i.test(info.status)) emoji = "❌";
      else if (/resolvido/i.test(info.status)) emoji = "✅";
      else if (/aguardando validação/i.test(info.status)) emoji = "🕒";

      await sendTelegramMessage(`${emoji} <b>${info.summary}</b>\nChamado <b>${issueKey}</b> atualizado para: <b>${info.status}</b>`);
    }
  }
}

// ⏱️ Agendador de monitoramento (a cada 3 minutos)
setInterval(monitorTickets, 3 * 60 * 1000);

// 📩 Recebendo mensagens do Telegram
app.post("/", async (req, res) => {
  console.log("📩 Dados recebidos do Telegram:", JSON.stringify(req.body, null, 2));

  if (req.body.message?.text) {
    const text = req.body.message.text;
    const jiraMatch = text.match(/SUPORTE-\d+/i);

    if (jiraMatch) {
      const issueKey = jiraMatch[0].toUpperCase();
      const info = await getJiraTicketStatus(issueKey);

      if (info) {
        monitoredTickets.set(issueKey, info.status);
        await sendTelegramMessage(`📡 Recebi o chamado Jira:\nhttps://grupomateus.atlassian.net/browse/${issueKey}\n\n📝 <b>${info.summary}</b>\n🔍 Status atual: <b>${info.status}</b>\n\nVou monitorar e avisar quando houver mudanças.`);
      } else {
        await sendTelegramMessage("⚠️ Não consegui consultar os detalhes desse chamado. Verifique se ele existe ou se você tem acesso no portal.");
      }
    }
  }

  res.sendStatus(200);
});

// 🚀 Inicializa o servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
