// Ensure the dotenv package is loaded at the top of the file
require('dotenv').config();
console.log("✅ Loaded API Key:", process.env.OPENAI_API_KEY);
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

// Enable CORS
app.use(cors({ origin: '*', optionsSuccessStatus: 200 }));
app.use(bodyParser.json());

// Serve static files from the parent directory's Public folder
const publicPath = path.join(__dirname, "..", "Public");
app.use(express.static(publicPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "dashboard.html"));
});


// Debugging middleware
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  if (req.method === "POST") {
    console.log("Request body:", req.body);
  }
  next();
});

// ✅ OpenAI API setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === SQLite setup ===
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

// === Basic Save Input ===
app.post("/save-input", (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).send("Input is required");

  db.run("INSERT INTO user_inputs (input) VALUES (?)", [input], function (err) {
    if (err) return res.status(500).send("Failed to save input");
    res.status(200).send({ id: this.lastID });
  });
});

// === Analyze All Inputs ===
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

// === Interview JSON Save Logic ===

const dataDir = path.join(__dirname, "data");
const filePath = path.join(dataDir, "interviews.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]");

app.post("/save-response", (req, res) => {
  console.log("Incoming save-response payload:", req.body);
  const { id, timestamp, responses } = req.body;

  if (!id || !timestamp || !responses || !Array.isArray(responses)) {
    return res.status(400).send("Invalid request body");
  }

  const newEntry = { id, timestamp, responses };

  fs.readFile(filePath, "utf8", (err, data) => {
    let allData = [];

    if (!err) {
      try {
        allData = JSON.parse(data);
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

// === GET & Analyze Responses ===

app.get("/interviews", (req, res) => {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Failed to read interviews.json:", err);
      return res.status(500).send("Failed to load interview data");
    }
    try {
      const parsed = JSON.parse(data);
      res.json(parsed);
    } catch (e) {
      console.error("JSON parse error:", e);
      res.status(500).send("Corrupted JSON file");
    }
  });
});

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

    const prompt = `
You are an AI assistant helping analyze user interview responses. 
Based on the answers below, please:

1. Determine the overall sentiment (Positive, Neutral, or Negative).
2. Write a concise 1–2 sentence summary of their feedback.

Respond in **JSON format** like this:

{
  "sentiment": "Positive",
  "summary": "User praised the app's syncing features but noted performance issues."
}

Responses:
${entry.responses.map(r => `Q: ${r.question}\nA: ${r.answer}`).join("\n")}
`;

    const result = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const rawOutput = result.choices[0].message.content.trim();

    // Try to parse AI's JSON result safely
    let analysis;
    try {
      analysis = JSON.parse(rawOutput);
    } catch (err) {
      console.warn("⚠️ Failed to parse AI response as JSON. Fallback to raw text.");
      analysis = { sentiment: "Unanalyzed", summary: rawOutput };
    }

    entry.analysis = analysis;

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log("✅ Analysis complete and saved for ID:", id);

    res.status(200).json(entry);
  } catch (error) {
    console.error("🔥 Error during analysis:", error);
    res.status(500).send("Failed to analyze response");
  }
});

// === Manual Test Route ===
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


// Generate summarized insights from all interview responses
app.get('/generate-insights', async (req, res) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const entries = JSON.parse(raw);

    if (!entries.length) {
      return res.status(200).json({ summary: "No responses available for analysis." });
    }

    const allQA = entries.flatMap(entry => 
      entry.responses.map(r => `Q: ${r.question}\nA: ${r.answer}`)
    );

    const prompt = `
You are an AI product research analyst. Based on the following user interview responses, generate a structured and actionable report.

User responses:
${allQA.join('\n\n')}

Your tasks:
1. Identify 3–5 recurring user needs or themes.
2. List product strengths and explain how they can be emphasized (e.g., in marketing or UX).
3. List product pain points and suggest clear, realistic fixes.
4. Create a recommendation table with:
   - Issue
   - Related Product (if mentioned)
   - Suggested Action
   - Priority (High / Medium / Low)

Format your answer with clear sections using bullet points and one markdown-style table.
Only use real patterns found in the responses—do not invent data.
`;

    const result = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }]
    });

    const summary = result.choices[0].message.content;
    console.log("📊 Insight Summary from OpenAI:\n", summary);

    res.status(200).json({ summary });

  } catch (error) {
    console.error("OpenAI error:", error);
    res.status(500).send('Failed to generate insights');
  }
});


// === Start Server ===
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
