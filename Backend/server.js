require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const { Configuration, OpenAIApi } = require('openai');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Initialize OpenAI (optional if only classifying)
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY // Securely load API key from .env file
});
const openai = new OpenAIApi(configuration);

// Initialize SQLite database
const db = new sqlite3.Database('./data/database.db');

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

// Ensure data file exists
const DATA_FILE = './data/interviews.json';
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
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

  const existing = JSON.parse(fs.readFileSync(DATA_FILE));
  existing.push(newEntry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));

  res.json({ status: 'saved', entry: newEntry });
});

// Get all saved entries for dashboard
app.get('/interviews', (req, res) => {
  fs.readFile('./data/interviews.json', 'utf8', (err, data) => {
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
  const filePath = './data/interviews.json';

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
  const filePath = './data/interviews.json';

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

// Start server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
