// index.js
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔑 Telegram
const TELEGRAM_TOKEN = "8462588145:AAGRhcJ7eJimORSuvGue4B55i4-0KT_swBQ";

// 🔑 Jira
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
const JIRA_DOMAIN = "https://grupomateus.atlassian.net";

// Porta dinâmica
const PORT = process.env.PORT || 10000;

// Armazena os chamados que estão sendo monitorados
let monitorados = {};

// 🔍 Função para consultar status no Jira
async function consultarStatus(chamado) {
  try {
    const url = `${JIRA_DOMAIN}/rest/api/3/issue/${chamado}`;
    const response = await axios.get(url, {
      auth: {
        username: JIRA_EMAIL,
        password: JIRA_API_TOKEN
      }
    });
    return response.data.fields.status.name;
  } catch (err) {
    console.error(`❌ Erro ao consultar ${chamado}:`, err.response?.data || err.message);
    return null;
  }
}

// 🔁 Verifica a cada 5 minutos se algum chamado mudou de status
setInterval(async () => {
  for (const [chamado, info] of Object.entries(monitorados)) {
    const statusAtual = await consultarStatus(chamado);
    if (statusAtual && statusAtual !== info.status) {
      // Atualizou o status — envia mensagem pro grupo
      const mensagem = `✅ Atualização no chamado *${chamado}*:\n🆕 Novo status: *${statusAtual}*`;
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: info.chatId,
        text: mensagem,
        parse_mode: "Markdown"
      });
      console.log(`📢 Enviado alerta de mudança: ${chamado} -> ${statusAtual}`);
      // Atualiza o status salvo
      monitorados[chamado].status = statusAtual;
    }
  }
}, 5 * 60 * 1000); // 5 minutos

// --- Webhook do Telegram ---
app.post("/", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Dados recebidos do Telegram:", JSON.stringify(data, null, 2));

    if (!data.message) return res.sendStatus(200);
    const msg = data.message;
    const chatId = msg.chat.id;
    const texto = msg.text ? msg.text.trim() : "";

    if (texto.includes("grupomateus.atlassian.net")) {
      const regex = /SUPORTE-\d+/i;
      const match = texto.match(regex);

      if (match) {
        const chamado = match[0];
        const status = await consultarStatus(chamado);

        if (status) {
          // Guarda o chamado em memória para monitorar depois
          monitorados[chamado] = { chatId, status };

          const resposta = `📋 Chamado *${chamado}* recebido.\n🔎 Status atual: *${status}*\n\n🕓 O bot vai monitorar e avisar se houver mudança.`;
          await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: resposta,
            parse_mode: "Markdown"
          });

          console.log(`✅ Monitorando ${chamado} (status: ${status})`);
        } else {
          await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: `❌ Não consegui consultar o status do chamado *${match[0]}*.`,
            parse_mode: "Markdown"
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Erro ao processar mensagem:", error);
    res.sendStatus(500);
  }
});

// Teste de rota principal
app.get("/", (req, res) => {
  res.send("✅ Servidor ativo e monitorando chamados Jira!");
});

// Inicia o servidor
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
