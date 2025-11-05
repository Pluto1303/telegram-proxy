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

// 📨 Função para enviar mensagem ao Telegram
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

// 🔍 Busca informações do chamado Jira via API
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
    const reporter = data.reporter?.displayName || "Desconhecido";
    const filial = "260 - MATEUS SUPERMERCADOS S.A. MIX TUCURUI";

    console.log(`✅ Dados Jira obtidos (${issueKey}): ${summary} - ${status}`);
    return { summary, status, reporter, filial };

  } catch (err) {
    console.error("❌ Erro ao buscar chamado Jira:", err.response?.statusText || err.message);
    return null;
  }
}

// 💬 Gera uma mensagem personalizada para o status do chamado
function getMensagemPorStatus(status, reporter) {
  const nome = reporter.split(" ")[0]; // usa apenas o primeiro nome para ficar mais natural
  const lower = status.toLowerCase();

  if (lower.includes("validação"))
    return `✅ *${nome}*, seu chamado foi atendido! Verifique se está tudo certo e aprove o chamado. Caso ainda haja algo pendente, recuse para que o suporte possa atuar novamente.`;

  if (lower.includes("cliente"))
    return `💬 *${nome}*, o suporte respondeu seu chamado e solicitou mais informações. Por favor, forneça os detalhes pedidos para que o atendimento continue.`;

  if (lower.includes("cancel"))
    return `❌ *${nome}*, o seu chamado foi cancelado pelo suporte. Verifique os comentários no Jira para entender o motivo e reabra o chamado se necessário.`;

  if (lower.includes("andamento"))
    return `🛠️ *${nome}*, seu chamado está em andamento. O suporte está trabalhando para resolver o problema.`;

  if (lower.includes("feito") || lower.includes("resolvido"))
    return `✅ *${nome}*, seu chamado foi resolvido com sucesso! Caso algo ainda não esteja correto, informe no chamado para reabrir.`;

  return `📌 *${nome}*, seu chamado foi atualizado para o status: *${status}*.`;
}

// ⏱️ Monitora alterações de status
async function monitorarChamados() {
  for (const issueKey in monitorados) {
    const info = monitorados[issueKey];
    const novo = await getJiraTicketStatus(issueKey);

    if (novo && novo.status !== info.statusAnterior) {
      const mensagemStatus = getMensagemPorStatus(novo.status, novo.reporter);

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
        `✅ *Chamado:* ${issueKey}\n` +
        `📋 *Resumo:* ${chamado.summary}\n` +
        `🏬 *Filial:* ${chamado.filial}\n` +
        `🙍‍♂️ *Solicitante:* ${chamado.reporter}\n` +
        `📌 *Status:* ${chamado.status}\n\n` +
        `🤖 *Olá ${chamado.reporter}*, recebi o seu chamado e já estou monitorando. Assim que houver qualquer atualização, informarei por aqui!\n\n` +
        `🔗 [Abrir no Jira](${JIRA_BASE_URL}/browse/${issueKey})`
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
