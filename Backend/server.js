const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const path = require("path");

dotenv.config(); // Load .env variables

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('Public'));

// Middleware to log incoming requests for debugging
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  if (req.method === 'POST') {
    console.log('Request body:', req.body);
  }
  next();
});

// ✅ Initialize OpenAI client with v4 syntax
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Update database path to be relative to the root directory
const dbPath = path.join(__dirname, "data", "database.db");
const db = new sqlite3.Database(dbPath);

// Create tables for user inputs and analyzed data
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

// Save user input to the database
app.post('/save-input', (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).send('Input is required');

  db.run('INSERT INTO user_inputs (input) VALUES (?)', [input], function (err) {
    if (err) return res.status(500).send('Failed to save input');
    res.status(200).send({ id: this.lastID });
  });
});

// Analyze data using OpenAI and save the results
app.post('/analyze-data', async (req, res) => {
  db.all('SELECT * FROM user_inputs', async (err, rows) => {
    if (err) return res.status(500).send('Failed to fetch inputs');

    const inputs = rows.map(row => row.input).join('\n');
    const prompt = `Analyze the following data:\n${inputs}`;

    try {
      const result = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }]
      });

      const analysis = result.choices[0].message.content;
      db.run('INSERT INTO analyzed_data (analysis) VALUES (?)', [analysis], function (err) {
        if (err) return res.status(500).send('Failed to save analysis');
        res.status(200).send({ id: this.lastID });
      });
    } catch (error) {
      res.status(500).send('Failed to analyze data');
    }
  });
});

// Analyze data after saving user input
app.post('/save-and-analyze', async (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).send('Input is required');

  // Save input to the database
  db.run('INSERT INTO user_inputs (input) VALUES (?)', [input], function (err) {
    if (err) return res.status(500).send('Failed to save input');

    // Analyze the data after saving
    db.all('SELECT * FROM user_inputs', async (err, rows) => {
      if (err) return res.status(500).send('Failed to fetch inputs');

      const inputs = rows.map(row => row.input).join('\n');
      const prompt = `Analyze the following data:\n${inputs}`;

      try {
        const result = await openai.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: prompt }]
        });

        const analysis = result.choices[0].message.content;
        db.run('INSERT INTO analyzed_data (analysis) VALUES (?)', [analysis], function (err) {
          if (err) return res.status(500).send('Failed to save analysis');
          res.status(200).send({ id: this.lastID });
        });
      } catch (error) {
        res.status(500).send('Failed to analyze data');
      }
    });
  });
});

// Fetch analyzed data for the dashboard
app.get('/analyzed-data', (req, res) => {
  db.all('SELECT * FROM analyzed_data', (err, rows) => {
    if (err) return res.status(500).send('Failed to fetch analyzed data');
    res.status(200).json(rows);
  });
});

// Ensure data directory and file exist
const dataDir = path.join(__dirname, "data");
const filePath = path.join(dataDir, "interviews.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, "[]"); // empty JSON array
}

// Store user Q&A pairs (no OpenAI call here)
app.post('/chat', (req, res) => {
  const { question, answer } = req.body;

  if (!question || !answer) {
    return res.status(400).json({ error: 'Missing question or answer' });
  }

  const newEntry = {
    timestamp: new Date().toISOString(),
    question,
    answer
  };

  const existing = JSON.parse(fs.readFileSync(filePath));
  existing.push(newEntry);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

  res.json({ status: 'saved', entry: newEntry });
});

// Get all saved entries for dashboard
app.get('/interviews', (req, res) => {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading data');
    res.json(JSON.parse(data));
  });
});

// Classify sentiment using OpenAI
app.post('/classify', async (req, res) => {
  const { text } = req.body;
  const prompt = `Classify this feedback as Positive, Neutral, or Negative:\n"${text}"`;

  const result = await openai.createCompletion({
    model: "text-davinci-003",
    prompt,
    max_tokens: 10
  });

  const sentiment = result.data.choices[0].text.trim();
  res.json({ sentiment });
});

// Save interview responses
app.post('/save-interview', (req, res) => {
  const newEntry = req.body;

  fs.readFile(filePath, 'utf8', (err, data) => {
    const allData = data ? JSON.parse(data) : [];
    allData.push(newEntry);

    fs.writeFile(filePath, JSON.stringify(allData, null, 2), err => {
      if (err) {
        res.status(500).send('Failed to save');
      } else {
        res.status(200).send('Saved');
      }
    });
  });
});

// Save responses
app.post('/save', (req, res) => {
  const newEntry = req.body;

  fs.readFile(filePath, 'utf8', (err, data) => {
    const allData = data ? JSON.parse(data) : [];
    allData.push(newEntry);

    fs.writeFile(filePath, JSON.stringify(allData, null, 2), err => {
      if (err) {
        res.status(500).send('Failed to save');
      } else {
        res.status(200).json({ message: 'Saved successfully' });
      }
    });
  });
});

// Save interview responses and analyze them
app.post('/save-response', (req, res) => {
  const { id, timestamp, responses } = req.body;
  if (!id || !timestamp || !responses || !Array.isArray(responses)) {
    return res.status(400).send('Invalid request body');
  }

  const newEntry = { id, timestamp, responses };

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading data');
    }

    let allData = [];
    try {
      allData = JSON.parse(data);
    } catch (parseError) {
      return res.status(500).send('Error parsing data');
    }

    allData.push(newEntry);

    fs.writeFile(filePath, JSON.stringify(allData, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).send('Error saving data');
      }

      res.status(200).json({ message: 'Response saved successfully', entry: newEntry });
    });
  });
});

// Analyze responses using OpenAI
app.post('/analyze-response', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send('ID is required');

  const data = JSON.parse(fs.readFileSync(filePath));
  const entry = data.find(item => item.id === id);
  if (!entry) return res.status(404).send('Entry not found');

  try {
    const prompt = `Analyze the following response:\nQuestion: ${entry.question}\nResponse: ${entry.response}`;
    const result = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }]
    });

    entry.analysis = result.choices[0].message.content;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    res.status(200).json(entry);
  } catch (error) {
    res.status(500).send('Failed to analyze response');
  }
});

// Fetch all responses
app.get('/responses', (req, res) => {
  const data = JSON.parse(fs.readFileSync(filePath));
  res.status(200).json(data);
});

// ✅ Route example
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

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
