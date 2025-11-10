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

// 🧠 Armazena chamados monitorados
let monitorados = {};

// 🔒 Escapa caracteres reservados do MarkdownV2
function escapeMarkdownV2(text) {
  if (!text) return "";
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// 📨 Envia mensagem segura ao Telegram
async function sendTelegramMessage(text, chatId = TELEGRAM_CHAT_ID) {
  try {
    // Mantém links Markdown intactos
    const parts = text.split(/\[.*?\]\(.*?\)/);
    const matches = text.match(/\[.*?\]\(.*?\)/g) || [];

    let escaped = "";
    for (let i = 0; i < parts.length; i++) {
      escaped += escapeMarkdownV2(parts[i]);
      if (matches[i]) escaped += matches[i];
    }

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: escaped,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false
    });
  } catch (err) {
    console.error("❌ Erro ao enviar mensagem ao Telegram:", err.response?.data || err.message);
  }
}

// 🔍 Busca informações do chamado Jira
async function getJiraTicketStatus(issueKey) {
  const headers = {
    "Authorization": `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
    "Accept": "application/json"
  };

  try {
    const url = `${JIRA_BASE_URL}/rest/servicedeskapi/request/${issueKey}`;
    const response = await axios.get(url, { headers });
    const data = response.data;

    return {
      summary: data.summary || "Sem título",
      status: data.currentStatus?.status || "Desconhecido",
      reporter: data.reporter?.displayName || "Desconhecido",
      filial: "260 - MATEUS SUPERMERCADOS S.A. MIX TUCURUI"
    };
  } catch (err) {
    console.error("❌ Erro ao buscar chamado Jira:", err.response?.statusText || err.message);
    return null;
  }
}

// 💬 Mensagens personalizadas por status
function getMensagemPorStatus(status, mention, issueKey) {
  const lower = status.toLowerCase();

  if (lower.includes("validação"))
    return `✅ ${mention}, seu chamado foi *atendido*.\nPor favor, verifique se a solicitação foi resolvida corretamente.\nCaso ainda haja pendências, *recuse o chamado* para que o suporte possa atuar novamente.\n\n🌐 [Acompanhar no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

  if (lower.includes("cliente"))
    return `💬 ${mention}, o suporte respondeu seu chamado e solicitou *mais informações*.\nPor favor, forneça os detalhes necessários para que o atendimento continue.\n\n🌐 [Responder no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

  if (lower.includes("cancel"))
    return `❌ ${mention}, seu chamado foi *cancelado* pelo suporte.\nVerifique os comentários no Jira para entender o motivo e, se necessário, *abra um novo chamado*.\n\n🌐 [Ver detalhes](${JIRA_BASE_URL}/browse/${issueKey})`;

  if (lower.includes("andamento"))
    return `🛠️ ${mention}, seu chamado está *em andamento*.\nA equipe técnica está trabalhando para resolver o problema o mais breve possível.\n\n🌐 [Acompanhar no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

  if (lower.includes("feito") || lower.includes("resolvido"))
    return `🎯 ${mention}, seu chamado foi *resolvido com sucesso*!\nCaso ainda haja algum problema, basta responder ao chamado para reabri-lo.\n\n🌐 [Ver no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

  if (lower.includes("autorização"))
    return `📝 ${mention}, seu chamado está *aguardando autorização* do gerente ou subgerente informado.\nSolicite a aprovação para que o suporte possa dar continuidade ao atendimento.\n\n🌐 [Ver no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

  if (lower.includes("fechado"))
    return `📁 ${mention}, o chamado foi *finalizado e fechado* no sistema.\nAgradecemos o acompanhamento! Caso surja nova necessidade, por favor, *abra um novo chamado*.\n\n🌐 [Consultar no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

  return `📌 ${mention}, seu chamado foi atualizado para o status: *${status}*.\n\n🌐 [Ver no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;
}

// ⏱️ Monitora chamados a cada 2 minutos
async function monitorarChamados() {
  for (const issueKey in monitorados) {
    const info = monitorados[issueKey];
    const novo = await getJiraTicketStatus(issueKey);

    if (novo && novo.status !== info.statusAnterior) {
      const mensagemStatus = getMensagemPorStatus(novo.status, info.mention, issueKey);
      const msg =
        `📢 *Atualização no chamado*\n\n` +
        `🔹 *Chamado:* ${issueKey}\n` +
        `🧾 *Resumo:* ${novo.summary}\n` +
        `🏬 *Filial:* ${novo.filial}\n` +
        `🙍‍♂️ *Solicitante:* ${novo.reporter}\n` +
        `📊 *Status:* ${info.statusAnterior} ➜ ${novo.status}\n\n` +
        `${mensagemStatus}`;

      await sendTelegramMessage(msg, info.chatId);
      monitorados[issueKey].statusAnterior = novo.status;
    }
  }
}

setInterval(monitorarChamados, 2 * 60 * 1000);

// 📥 Webhook Telegram
app.post("/", async (req, res) => {
  console.log("📩 Dados recebidos do Telegram:", JSON.stringify(req.body, null, 2));

  const message = req.body?.message;
  const text = message?.text;
  if (!text) return res.sendStatus(200);

  const jiraRegex = /SUPORTE-\d+/i;
  const match = text.match(jiraRegex);

  if (match) {
    const issueKey = match[0];
    const chamado = await getJiraTicketStatus(issueKey);

    const mention = message.from.username
      ? `@${message.from.username}`
      : message.from.first_name
        ? message.from.first_name
        : "Usuário";

    if (chamado) {
      monitorados[issueKey] = {
        statusAnterior: chamado.status,
        summary: chamado.summary,
        mention,
        chatId: message.chat.id
      };

      const msg =
        `📨 *Novo chamado identificado!*\n\n` +
        `🔹 *Chamado:* ${issueKey}\n` +
        `🧾 *Resumo:* ${chamado.summary}\n` +
        `🏬 *Filial:* ${chamado.filial}\n` +
        `🙍‍♂️ *Solicitante:* ${chamado.reporter}\n` +
        `📌 *Status:* ${chamado.status}\n\n` +
        `🤖 Olá ${mention}, o *bot auxiliar do CPD* recebeu o seu chamado e já está monitorando. Assim que houver qualquer atualização, informarei por aqui.\n\n` +
        `🌐 [Abrir no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

      await sendTelegramMessage(msg, message.chat.id);
    } else {
      await sendTelegramMessage(
        `⚠️ ${mention}, não consegui consultar o chamado *${issueKey}*. Verifique se o link está correto ou se tenho acesso.`,
        message.chat.id
      );
    }
  }

  res.sendStatus(200);
});

// 🩺 Rota de verificação (Render/Uptime Kuma)
app.get("/ping", (req, res) => {
  res.status(200).send("✅ Bot auxiliar do CPD está ativo e operante!");
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
