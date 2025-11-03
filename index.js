import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

// Substitua este link pelo SEU webhook do Google Apps Script
const GOOGLE_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbytKzYtG7wzXbqy_Jhdno93c3xee8oFk2FU5xv5X34O861rzA9YUAwtFBdvOIxecXme/exec";

app.post("/", async (req, res) => {
  try {
    const body = req.body;
    console.log("📩 Dados recebidos do Telegram:", body);

    await fetch(GOOGLE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Erro ao enviar para o Google Apps Script:", error);
    res.status(500).send("Erro interno");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
