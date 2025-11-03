
const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// Substitua pelo URL do seu Google Apps Script
const SCRIPT_URL = https://script.google.com/home/projects/1pOYF3VowlNGo7Vc3A5aMCsblqgD48Y4wY4mWPT9DkDVQrOGW6l74KRXw/edit;

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
  console.log(`Server is running on port ${PORT}`);
});


