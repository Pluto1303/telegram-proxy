// index.js
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔑 Token e Chat ID do seu bot
const TELEGRAM_TOKEN = "8462588145:AAGRhcJ7eJimORSuvGue4B55i4-0KT_swBQ";

// Porta dinâmica usada pelo Render
const PORT = process.env.PORT || 10000;

// Rota principal — só pra testar se o servidor está vivo
app.get("/", (req, res) => {
  res.send("✅ Servidor rodando e aguardando mensagens do Telegram!");
});

// Endpoint Webhook do Telegram
app.post("/", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Dados recebidos do Telegram:", JSON.stringify(data, null, 2));

    if (!data.message) {
      return res.sendStatus(200);
    }

    const msg = data.message;
    const chatId = msg.chat.id;
    const texto = msg.text ? msg.text.trim() : "";

    // --- Lógica: detectar links do Jira ---
    if (texto && texto.includes("grupomateus.atlassian.net")) {
      const jiraLink = texto;

      const resposta = `📋 Recebi o chamado Jira:\n${jiraLink}\n\n🔍 Vou monitorar e avisar se houver atualização.`;

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: resposta,
        parse_mode: "Markdown"
      });

      console.log(`✅ Mensagem de confirmação enviada para o grupo: ${chatId}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Erro ao processar mensagem:", error);
    res.sendStatus(500);
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
