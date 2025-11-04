// index.js
import express from "express";
import axios from "axios";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// 🔐 Variáveis de ambiente
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const monitoredIssues = {}; // Armazena status atuais de cada chamado

// 🧠 Função para consultar status do chamado via API REST do Jira
async function getJiraIssueStatus(issueKey) {
  try {
    const response = await axios.get(
      `https://grupomateus.atlassian.net/rest/api/3/issue/${issueKey}`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${JIRA_EMAIL}:${JIRA_API_TOKEN}`
          ).toString("base64")}`,
          Accept: "application/json",
        },
      }
    );

    const fields = response.data.fields;
    return {
      status: fields.status.name,
      summary: fields.summary,
      assignee: fields.assignee ? fields.assignee.displayName : "Não atribuído",
    };
  } catch (error) {
    console.error("Erro ao buscar chamado Jira:", error.response?.statusText || error.message);
    return null;
  }
}

// 🕒 Monitora mudanças de status periodicamente
async function monitorJiraIssues() {
  for (const issueKey in monitoredIssues) {
    const info = monitoredIssues[issueKey];
    const current = await getJiraIssueStatus(issueKey);

    if (current && current.status !== info.status) {
      monitoredIssues[issueKey] = current; // Atualiza cache
      const msg = `⚙️ O chamado *${issueKey}* foi atualizado!\n` +
        `📋 *${current.summary}*\n` +
        `👤 Responsável: ${current.assignee}\n` +
        `🟢 Novo status: *${current.status}*`;

      await sendMessage(info.chatId, msg);
    }
  }
}

// ⏱️ Executa o monitoramento a cada 2 minutos
setInterval(monitorJiraIssues, 2 * 60 * 1000);

// 📩 Função para enviar mensagem no Telegram
async function sendMessage(chatId, text) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  });
}

// 🧩 Webhook do Telegram
app.post("/", async (req, res) => {
  console.log("📩 Dados recebidos do Telegram:", JSON.stringify(req.body, null, 2));

  const message = req.body.message;
  if (!message || !message.text) return res.sendStatus(200);

  const chatId = message.chat.id;
  const text = message.text;

  // 🔍 Detecta link do Jira e extrai a chave (ex: SUPORTE-1275286)
  const jiraMatch = text.match(/SUPORTE-\d+/i);
  if (jiraMatch) {
    const issueKey = jiraMatch[0].toUpperCase();

    const issue = await getJiraIssueStatus(issueKey);
    if (!issue) {
      await sendMessage(chatId, `❌ Não consegui consultar o status do chamado *${issueKey}*`);
      return res.sendStatus(200);
    }

    monitoredIssues[issueKey] = { ...issue, chatId };
    await sendMessage(
      chatId,
      `✅ Chamado *${issueKey}* registrado para monitoramento.\n` +
      `📋 *${issue.summary}*\n` +
      `👤 Responsável: ${issue.assignee}\n` +
      `📊 Status atual: *${issue.status}*`
    );
  }

  res.sendStatus(200);
});

// 🚀 Inicia servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
