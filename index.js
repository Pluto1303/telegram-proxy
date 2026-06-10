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
async function sendTelegramMessage(text, chatId = TELEGRAM_CHAT_ID, replyMarkup = null) {
  try {
    const parts = text.split(/\[.*?\]\(.*?\)/);
    const matches = text.match(/\[.*?\]\(.*?\)/g) || [];

    let escaped = "";
    for (let i = 0; i < parts.length; i++) {
      escaped += escapeMarkdownV2(parts[i]);
      if (matches[i]) escaped += matches[i];
    }

    const payload = {
      chat_id: chatId,
      text: escaped,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      payload
    );
  } catch (err) {
    console.error(
      "❌ Erro ao enviar mensagem ao Telegram:",
      err.response?.data || err.message
    );
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
function getMensagemPorStatus(status, mention, anterior = "") {
  const lower = status.toLowerCase();

  // ✅ Fechado
  if (lower.includes("fechada")) {
    return `📁 ${mention}, o seu chamado foi *encerrado com sucesso*.\n` +
      `Caso o problema persista, você pode *reabri-lo diretamente pelo Jira* para nova análise da equipe.`;
  }

  // 🔁 Aguardando validação ➜ Reaberta
  if (anterior.toLowerCase().includes("aguardando validação") && lower.includes("reaberta")) {
    return `♻️ ${mention}, o seu chamado foi *reaberto* e retornou para a *fila de atendimento do Suporte N1*.\n` +
      `Nossa equipe irá analisar novamente o caso e dará sequência ao suporte o mais breve possível.`;
  }

  // 📨 Aguardando autorização ➜ Aguardando pelo Suporte
  if (anterior.toLowerCase().includes("autorização") && lower.includes("suporte")) {
    return `📨 ${mention}, o *gerente ou subgerente aprovou seu chamado*.\n` +
      `Ele agora entrou na *fila de atendimento da equipe do Suporte N1*, que dará continuidade ao processo.`;
  }

  // ⚙️ Padrões gerais
  if (lower.includes("validação"))
    return `✅ ${mention}, seu chamado foi *atendido*. Verifique se está tudo certo e aprove o chamado. Caso ainda haja algo pendente, recuse para que o suporte possa atuar novamente.`;

  if (lower.includes("cliente"))
    return `💬 ${mention}, o suporte respondeu seu chamado e solicitou mais informações. Por favor, forneça os detalhes pedidos para que o atendimento continue.`;

  if (lower.includes("cancel"))
    return `❌ ${mention}, o seu chamado foi *cancelado* pelo suporte. Verifique os comentários no Jira para entender o motivo e reabra o chamado se necessário.`;

  if (lower.includes("andamento"))
    return `🛠️ ${mention}, seu chamado está *em andamento*. O suporte está trabalhando para resolver o problema.`;

  if (lower.includes("feito") || lower.includes("resolvido"))
    return `✅ ${mention}, seu chamado foi *resolvido com sucesso*! Caso algo ainda não esteja correto, informe no chamado para reabrir.`;

  if (lower.includes("autorização"))
    return `📝 ${mention}, seu chamado está *aguardando autorização* do gerente ou subgerente informado. Solicite a aprovação para que o suporte prossiga.`;

  return `📌 ${mention}, seu chamado foi atualizado para o status: *${status}*.`;
}

// ⏱️ Monitora chamados a cada 2 minutos
async function monitorarChamados() {
  for (const issueKey in monitorados) {
    const info = monitorados[issueKey];
    const novo = await getJiraTicketStatus(issueKey);

    if (novo && novo.status !== info.statusAnterior) {
      const mensagemStatus = getMensagemPorStatus(novo.status, info.mention, info.statusAnterior);
      const msg =
        `📢 *Atualização no chamado*\n\n` +
        `📘 *Chamado:* ${issueKey}\n` +
        `🧾 *Resumo:* ${novo.summary}\n` +
        `🏢 *Filial:* ${novo.filial}\n` +
        `👤 *Solicitante:* ${novo.reporter}\n` +
        `📊 *Status:* ${info.statusAnterior} ➜ ${novo.status}\n\n` +
        `${mensagemStatus}\n\n` +
        `[🔗 Ver no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

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

  const callback = req.body?.callback_query;

  if (callback?.data?.startsWith("status_")) {
    const issueKey = callback.data.replace("status_", "");

    const chamado = await getJiraTicketStatus(issueKey);

    if (chamado) {
      const msg =
        `🔄 *Consulta manual*\n\n` +
        `📘 *Chamado:* ${issueKey}\n` +
        `🧾 *Resumo:* ${chamado.summary}\n` +
        `🏢 *Filial:* ${chamado.filial}\n` +
        `👤 *Solicitante:* ${chamado.reporter}\n` +
        `📊 *Status:* ${chamado.status}\n\n` +
        `[🔗 Ver no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

      // await sendTelegramMessage(
      //   msg,
      //   callback.message.chat.id
      // );
    }

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`,
      {
        callback_query_id: callback.id,
        text:
          `Chamado: ${issueKey}\n` +
          `Status: ${chamado?.status || "Indisponível"}`,
        show_alert: true
      }
    );

    return res.sendStatus(200);
  }
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
        `🆕 *Chamado:* ${issueKey}\n` +
        `🧾 *Resumo:* ${chamado.summary}\n` +
        `🏢 *Filial:* ${chamado.filial}\n` +
        `👤 *Solicitante:* ${chamado.reporter}\n` +
        `📊 *Status:* ${chamado.status}\n\n` +
        `👋 Olá ${mention}, recebi o seu chamado e já estou monitorando.\n` +
        `O *bot auxiliar do CPD* informará automaticamente por aqui sempre que houver uma atualização.\n\n` +
        `[🔗 Ver no Jira](${JIRA_BASE_URL}/browse/${issueKey})`;

      const botoes = {
        inline_keyboard: [
          [
            {
              text: "🔄 Atualizar Status",
              callback_data: `status_${issueKey}`
            }
          ]
        ]
      };

      await sendTelegramMessage(
        msg,
        message.chat.id,
        botoes
      );
    } else {
      await sendTelegramMessage(
        `⚠️ ${mention}, não consegui consultar o chamado *${issueKey}*. Verifique se o link está correto ou se tenho acesso.`,
        message.chat.id
      );
    }
  }

  res.sendStatus(200);
});

// 🩺 Rota de verificação (Uptime Kuma/Render)
app.get("/ping", (req, res) => {
  res.status(200).send("✅ Bot ativo e operante!");
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
