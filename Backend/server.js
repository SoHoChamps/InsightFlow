// Ensure the dotenv package is loaded at the top of the file
require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("Public"));

// Debugging middleware
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  if (req.method === "POST") {
    console.log("Request body:", req.body);
  }
  next();
});

// ✅ Initialize OpenAI v4
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Database setup
const dbPath = path.join(__dirname, "data", "database.db");
const db = new sqlite3.Database(dbPath);

const createTables = () => {
  db.run(`CREATE TABLE IF NOT EXISTS user_inputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    input TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS analyzed_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analysis TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS interview_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    response TEXT NOT NULL,
    analysis TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
};

createTables();

// === Analysis-related Routes ===

app.post("/save-input", (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).send("Input is required");

  db.run("INSERT INTO user_inputs (input) VALUES (?)", [input], function (err) {
    if (err) return res.status(500).send("Failed to save input");
    res.status(200).send({ id: this.lastID });
  });
});

app.post("/analyze-data", async (req, res) => {
  db.all("SELECT * FROM user_inputs", async (err, rows) => {
    if (err) return res.status(500).send("Failed to fetch inputs");

    const inputs = rows.map((row) => row.input).join("\n");
    const prompt = `Analyze the following data:\n${inputs}`;

    try {
      const result = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
      });

      const analysis = result.choices[0].message.content;
      db.run("INSERT INTO analyzed_data (analysis) VALUES (?)", [analysis], function (err) {
        if (err) return res.status(500).send("Failed to save analysis");
        res.status(200).send({ id: this.lastID });
      });
    } catch (error) {
      res.status(500).send("Failed to analyze data");
    }
  });
});

app.get("/analyzed-data", (req, res) => {
  db.all("SELECT * FROM analyzed_data", (err, rows) => {
    if (err) return res.status(500).send("Failed to fetch analyzed data");
    res.status(200).json(rows);
  });
});

// === JSON Interview Save Logic ===

const dataDir = path.join(__dirname, "data");
const filePath = path.join(dataDir, "interviews.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, "[]");
}

app.post("/save-response", (req, res) => {
  console.log("Incoming save-response payload:", req.body); // ✅ ADD THIS LINE
  const { id, timestamp, responses } = req.body;

  if (!id || !timestamp || !responses || !Array.isArray(responses)) {
    return res.status(400).send("Invalid request body");
  }

  const newEntry = { id, timestamp, responses };

  // Try reading the file or initialize empty
  fs.readFile(filePath, "utf8", (err, data) => {
    let allData = [];

    if (err) {
      if (err.code === "ENOENT") {
        // File doesn't exist yet
        console.log("interviews.json not found. Creating new file.");
      } else {
        console.error("Error reading file:", err);
        return res.status(500).send("Error reading data");
      }
    } else {
      try {
        allData = JSON.parse(data);
        if (!Array.isArray(allData)) allData = [];
      } catch (parseErr) {
        console.error("Error parsing file:", parseErr);
        return res.status(500).send("Error parsing data");
      }
    }

    allData.push(newEntry);

    fs.writeFile(filePath, JSON.stringify(allData, null, 2), (writeErr) => {
      if (writeErr) {
        console.error("Error writing file:", writeErr);
        return res.status(500).send("Error saving data");
      }

      console.log("Response saved successfully:", newEntry);
      res.status(200).json({ message: "Response saved successfully", entry: newEntry });
    });
  });
});


// === GET and ANALYZE Responses ===

app.get("/responses", (req, res) => {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) return res.status(500).send("Failed to read responses");
    try {
      res.status(200).json(JSON.parse(data));
    } catch (parseErr) {
      res.status(500).send("Failed to parse responses");
    }
  });
});

app.post("/analyze-response", async (req, res) => {
  const { id } = req.body;
  console.log("🔍 Incoming /analyze-response request with ID:", id);

  if (!id) return res.status(400).send("ID is required");

  try {
    const raw = fs.readFileSync(filePath);
    const data = JSON.parse(raw);
    const entry = data.find((item) => item.id === id);

    if (!entry) {
      console.error("❌ Entry not found for ID:", id);
      return res.status(404).send("Entry not found");
    }

    const prompt = `Analyze the following interview responses:\n${entry.responses.map(
      (r) => `Q: ${r.question}\nA: ${r.answer}`
    ).join("\n")}`;

    const result = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    entry.analysis = result.choices[0].message.content;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log("✅ Analysis complete and saved for ID:", id);

    res.status(200).json(entry);
  } catch (error) {
    console.error("🔥 Error during analysis:", error);
    res.status(500).send("Failed to analyze response");
  }
});

// ✅ Simple Test Route
app.post("/api/analyze", async (req, res) => {
  const userText = req.body.text;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a helpful assistant that analyzes user feedback." },
        { role: "user", content: `Analyze this customer feedback: \"${userText}\"` },
      ],
    });

    const analysis = response.choices[0].message.content;
    res.json({ analysis });
  } catch (error) {
    console.error("OpenAI API error:", error);
    res.status(500).json({ error: "Something went wrong with the analysis." });
  }
});

// === Start Server ===

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
