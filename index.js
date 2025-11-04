const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// ✅ URL do Apps Script correto (link publicado /exec)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbytKzYtG7wzXbqy_Jhdno93c3xee8oFk2fU5xv5X34O861rzA9YUAwtFBdvOIxecXme/exec";

app.post("/", async (req, res) => {
  console.log("📩 Dados recebidos do Telegram:", req.body);

  try {
    await axios.post(SCRIPT_URL, req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Erro ao enviar para Google Apps Script:", error.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

