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

// 🧹 Função para limpar caracteres que quebram o Markdown
function sanitizeMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// 📨 Função para enviar mensagem ao Telegram
async function sendTelegramMessage(text) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false
    });
  } catch (err) {
    console.error("❌ Erro ao enviar mensagem ao Telegram:", err.response?.data || err.message);
  }
}

// 🔍 Busca informações do chamado Jira via API
async function getJiraTicketStatus(issueKey) {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
    Accept: "application/json"
  };

  try {
    const url = `${JIRA_BASE_URL}/rest/servicedeskapi/request/${issueKey}`;
    const response = await axios.get(url, { headers });
    const data = response.data;

    const summary = sanitizeMarkdown(data.summary || "Sem título");
    const status = sanitizeMarkdown(data.currentStatus?.status || "Desconhecido");
    const reporter = sanitizeMarkdown(data.reporter?.displayName || "Desconhecido");
    const filial = "260 - MATEUS SUPERMERCADOS S.A. MIX TUCURUI";

    console.log(`✅ Jira OK (${issueKey}): ${summary} - ${status}`);
    return { summary, status, reporter, filial };

  } catch (err) {
    console.error("❌ Erro ao buscar chamado Jira:", err.response?.statusText || err.message);
    return null;
  }
}

// 💬 Gera uma mensagem personalizada de acordo com o status do chamado
function getMensagemPorStatus(status, mention) {
  const lower = status.toLowerCase();

  if (lower.includes("validação"))
    return `✅ ${mention}, seu chamado foi atendido\\. Verifique se está tudo certo e aprove o chamado\\. Caso ainda haja algo pendente, recuse para que o suporte possa atuar novamente\\.`;

  if (lower.includes("cliente"))
    return `💬 ${mention}, o suporte respondeu seu chamado e solicitou mais informações\\. Por favor, forneça os detalhes pedidos para que o atendimento continue\\.`;

  if (lower.includes("cancel"))
    return `❌ ${mention}, o seu chamado foi cancelado pelo suporte\\. Verifique os comentários no Jira para entender o motivo e reabra o chamado se necessário\\.`;

  if (lower.includes("andamento"))
    return `🛠️ ${mention}, seu chamado está em andamento\\. O suporte está trabalhando para resolver o problema\\.`;

  if (lower.includes("feito") || lower.includes("resolvido"))
    return `✅ ${mention}, seu chamado foi resolvido com sucesso\\. Caso algo ainda não esteja correto, informe no chamado para reabrir\\.`;

  if (lower.includes("autorização"))
    return `📝 ${mention}, seu chamado está aguardando *autorização* do gerente ou subgerente informado\\. Solicite a aprovação para que o suporte possa prosseguir\\.`;

  return `📌 ${mention}, seu chamado foi atualizado para o status: *${status}*\\.`;
}

// ⏱️ Monitora alterações de status
async function monitorarChamados() {
  for (const issueKey in monitorados) {
    const info = monitorados[issueKey];
    const novo = await getJiraTicketStatus(issueKey);

    if (novo && novo.status !== info.statusAnterior) {
      const mensagemStatus = getMensagemPorStatus(novo.status, info.mention);

      await sendTelegramMessage(
        `🔔 *Atualização no chamado*\n\n` +
        `✅ *Chamado:* ${issueKey}\n` +
        `📋 *Resumo:* ${novo.summary}\n` +
        `🏬 *Filial:* ${novo.filial}\n` +
        `🙍‍♂️ *Solicitante:* ${novo.reporter}\n` +
        `📊 *Status:* ${info.statusAnterior} ➜ ${novo.status}\n\n` +
        `${mensagemStatus}\n\n` +
        `🔗 [Abrir no Jira](${JIRA_BASE_URL}/browse/${issueKey})`
      );

      monitorados[issueKey].statusAnterior = novo.status;
    }
  }
}

// 🔁 Executa a verificação a cada 2 minutos
setInterval(monitorarChamados, 2 * 60 * 1000);

// 📥 Recebe mensagens do Telegram
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
      ? `@${sanitizeMarkdown(message.from.username)}`
      : sanitizeMarkdown(message.from.first_name || "Usuário");

    if (chamado) {
      monitorados[issueKey] = {
        statusAnterior: chamado.status,
        summary: chamado.summary,
        mention
      };

      await sendTelegramMessage(
        `✅ *Chamado:* ${issueKey}\n` +
        `📋 *Resumo:* ${chamado.summary}\n` +
        `🏬 *Filial:* ${chamado.filial}\n` +
        `🙍‍♂️ *Solicitante:* ${chamado.reporter}\n` +
        `📌 *Status:* ${chamado.status}\n\n` +
        `🤖 Olá ${mention}, recebi o seu chamado e já estou monitorando\\. Assim que houver qualquer atualização, informarei por aqui\\.\n\n` +
        `🔗 [Abrir no Jira](${JIRA_BASE_URL}/browse/${issueKey})`
      );
    } else {
      await sendTelegramMessage(`⚠️ ${mention}, não consegui consultar o chamado *${issueKey}*\\. Verifique se o link está correto ou se tenho acesso\\.`);
    }
  }

  res.sendStatus(200);
});

// 🟢 Rota de ping para manter o Render ativo
app.get("/ping", (req, res) => {
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
  console.log(`💓 Ping recebido às ${now}`);
  res.status(200).send("✅ Bot online e monitorando chamados.");
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});



