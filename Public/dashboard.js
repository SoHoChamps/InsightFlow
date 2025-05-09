let originalData = [];

async function loadData() {
  const res = await fetch('/interviews');
  const data = await res.json();
  originalData = data;
  populateFilters(data);
  updateDashboard(data);
}

function populateFilters(data) {
  const countrySelect = document.getElementById('countrySelect');
  const genderSelect = document.getElementById('genderSelect');

  const countries = [...new Set(data.map(d => d.responses.find(r => r.question.toLowerCase().includes("country"))?.answer))].filter(Boolean);
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    countrySelect.appendChild(opt);
  });
}

function applyFilters() {
  const country = document.getElementById('countrySelect').value;
  const gender = document.getElementById('genderSelect').value;
  const date = document.getElementById('dateInput').value;

  const filtered = originalData.filter(d => {
    const responseMap = Object.fromEntries(d.responses.map(r => [r.question.toLowerCase(), r.answer]));
    const entryDate = new Date(d.timestamp).toISOString().split("T")[0];
    return (country === "All" || responseMap["what country are you from?"] === country) &&
           (gender === "All" || responseMap["what is your gender?"] === gender) &&
           (!date || entryDate === date);
  });

  updateDashboard(filtered);
}

function exportCSV() {
  const rows = [];
  originalData.forEach(d => {
    const row = {};
    d.responses.forEach(r => {
      row[r.question] = r.answer;
    });
    row.timestamp = d.timestamp;
    rows.push(row);
  });

  const headers = Object.keys(rows[0] || {});
  const csv = [headers.join(",")].concat(
    rows.map(r => headers.map(h => `"${(r[h] || "").replace(/"/g, '""')}"`).join(","))
  ).join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "interview_data.csv";
  a.click();
}

function updateDashboard(data) {
  updateKPIs(data);
  renderCharts(data);
}

function updateKPIs(data) {
  document.getElementById('totalInterviews').textContent = data.length;

  let total = 0;
  let count = 0;
  const usageMap = {};
  const emotionMap = {};

  data.forEach(entry => {
    const map = Object.fromEntries(entry.responses.map(r => [r.question.toLowerCase(), r.answer]));
    const satisfaction = parseFloat(map["how satisfied were you with the product from 1 to 5 (5 = very satisfied)?"]);
    const usage = map["what did you use the product for?"];
    const emotion = map["what did you like most about it?"];

    if (!isNaN(satisfaction)) {
      total += satisfaction;
      count++;
    }

    if (usage) usageMap[usage] = (usageMap[usage] || 0) + 1;
    if (emotion) emotionMap[emotion] = (emotionMap[emotion] || 0) + 1;
  });

  document.getElementById('avgRating').textContent = count ? (total / count).toFixed(2) : "--";
  document.getElementById('topUsage').textContent = Object.entries(usageMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
  document.getElementById('topEmotion').textContent = Object.entries(emotionMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
}

function renderCharts(data) {
  const sentimentCount = {};
  const motivationCount = {};
  const contextCount = {};
  const satisfactionCount = {};

  data.forEach(entry => {
    const map = Object.fromEntries(entry.responses.map(r => [r.question.toLowerCase(), r.answer]));

    const sentiment = entry.analysis?.sentiment || "Unanalyzed";
    sentimentCount[sentiment] = (sentimentCount[sentiment] || 0) + 1;

    const motivation = map["how did you first hear about this product?"];
    if (motivation) motivationCount[motivation] = (motivationCount[motivation] || 0) + 1;

    const context = map["where were you when you used the product?"];
    if (context) contextCount[context] = (contextCount[context] || 0) + 1;

    const satisfaction = parseInt(map["how satisfied were you with the product from 1 to 5 (5 = very satisfied)?"]);
    if (!isNaN(satisfaction)) satisfactionCount[satisfaction] = (satisfactionCount[satisfaction] || 0) + 1;
  });

  renderPieChart('sentimentChart', sentimentCount);
  renderBarChart('motivationChart', motivationCount);
  renderBarChart('contextChart', contextCount);
  renderBarChart('satisfactionChart', satisfactionCount);
}

function renderChart(id, dataObj, type, options = {}) {
  const ctx = document.getElementById(id).getContext('2d');
  new Chart(ctx, {
    type,
    data: {
      labels: Object.keys(dataObj),
      datasets: [{
        data: Object.values(dataObj),
        backgroundColor: type === 'pie' ? ['#36A2EB', '#FFCE56', '#FF6384', '#4BC0C0'] : '#0074E0',
        label: id
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: type === 'pie' } },
      ...options
    }
  });
}

function renderPieChart(id, dataObj) {
  renderChart(id, dataObj, 'pie');
}

function renderBarChart(id, dataObj) {
  renderChart(id, dataObj, 'bar', { plugins: { legend: { display: false } } });
}

document.getElementById("applyFiltersBtn").addEventListener("click", applyFilters);
document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);

// Initial Load
window.onload = loadData;