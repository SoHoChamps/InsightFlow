let originalData = [];

async function loadData() {
  const res = await fetch('/interview.json');
  const data = await res.json();
  originalData = data;
  populateFilters(data);
  updateDashboard(data);
}

function populateFilters(data) {
  const countries = [...new Set(data.map(d => d.country))];
  const countryFilter = document.getElementById('countryFilter');
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    countryFilter.appendChild(opt);
  });
}

function applyFilters() {
  const country = document.getElementById('countryFilter').value;
  const gender = document.getElementById('genderFilter').value;
  const date = document.getElementById('dateFilter').value;

  const filtered = originalData.filter(d => {
    return (!country || d.country === country) &&
           (!gender || d.gender === gender) &&
           (!date || new Date(d.timestamp) >= new Date(date));
  });

  updateDashboard(filtered);
}

function exportCSV() {
  let csv = 'Name,Country,Gender,DOB,Satisfaction,Timestamp\n';
  originalData.forEach(d => {
    csv += `${d.fullName},${d.country},${d.gender},${d.dob},${d.satisfaction},${d.timestamp}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'interview_data.csv';
  a.click();
}

document.addEventListener("DOMContentLoaded", async () => {
  const response = await fetch('interview.json');
  const data = await response.json();

  // Helper: Count occurrences
  const countByValue = (arr) => {
    return arr.reduce((acc, val) => {
      if (val) acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
  };

  // Extract responses
  const ratings = data.map(d => parseFloat(d.satisfaction)).filter(n => !isNaN(n));
  const usage = data.map(d => d.usage).filter(Boolean);

  // === KPI Cards ===
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length || 0;
  document.getElementById('avgRating').innerText = avg.toFixed(2);
  document.getElementById('totalInterviews').innerText = data.length;

  // Optional additional KPIs (if elements are added in HTML)
  const topUse = Object.entries(countByValue(usage)).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
  const topUseEl = document.getElementById('topUsage');
  if (topUseEl) topUseEl.innerText = topUse;

  // === Charts ===

  // Sentiment placeholder (replace with real NLP later)
  const sentimentCounts = { Positive: 10, Neutral: 5, Negative: 3 };
  const sentimentCtx = document.getElementById('sentimentChart');
  if (sentimentCtx) {
    new Chart(sentimentCtx, {
      type: 'pie',
      data: {
        labels: Object.keys(sentimentCounts),
        datasets: [{
          data: Object.values(sentimentCounts),
          backgroundColor: ['#28a745', '#ffc107', '#dc3545'],
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // Usage chart (optional)
  const usageCounts = countByValue(usage);
  const usageLabels = Object.keys(usageCounts);
  const usageValues = Object.values(usageCounts);
  const usageCanvas = document.getElementById('usageChart');
  if (usageCanvas) {
    new Chart(usageCanvas, {
      type: 'bar',
      data: {
        labels: usageLabels,
        datasets: [{
          label: 'Usage',
          data: usageValues,
          backgroundColor: '#0074E0'
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend: { display: false } }
      }
    });
  }
});

fetch('/interviews')
  .then(res => res.json())
  .then(data => {
    updateKPIs(data);
    renderCharts(data);
  });

function updateKPIs(data) {
  document.getElementById('totalInterviews').innerText = data.length;
  const ratings = data.map(d => parseFloat(d.satisfaction)).filter(n => !isNaN(n));
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  document.getElementById('avgRating').innerText = avg.toFixed(2);
}

function renderCharts(data) {
  const motivations = {};

  data.forEach(d => {
    if (d.reasonChosen) motivations[d.reasonChosen] = (motivations[d.reasonChosen] || 0) + 1;
  });

  new Chart(document.getElementById('motivationChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(motivations),
      datasets: [{ data: Object.values(motivations), label: "Motivations", backgroundColor: "#0074E0" }]
    }
  });
}

async function loadAnalyzedData() {
  const res = await fetch('/analyzed-data');
  const data = await res.json();

  // Update KPI cards and charts with analyzed data
  document.getElementById('totalInterviews').innerText = data.length;
  const analysis = data.map(d => d.analysis).join('\n');
  document.getElementById('avgRating').innerText = analysis; // Example update
}

async function updateDashboardWithAnalyzedData() {
  const res = await fetch('/analyzed-data');
  const data = await res.json();

  // Update KPI cards with specific metrics
  const ratings = data.filter(d => d.analysis.includes('satisfaction')).map(d => parseFloat(d.analysis));
  const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length || 0;
  document.getElementById('avgRating').innerText = avgRating.toFixed(2);

  const usage = data.filter(d => d.analysis.includes('usage'));
  const usageCounts = usage.reduce((acc, d) => {
    const use = d.analysis;
    acc[use] = (acc[use] || 0) + 1;
    return acc;
  }, {});

  new Chart(document.getElementById('usageChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(usageCounts),
      datasets: [{
        label: 'Usage',
        data: Object.values(usageCounts),
        backgroundColor: '#0074E0'
      }]
    }
  });
}

// Fetch and display interview responses
async function fetchResponses() {
  try {
    const response = await fetch('/responses');
    const data = await response.json();

    const tableBody = document.querySelector('#response-table tbody');
    tableBody.innerHTML = '';

    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.question}</td>
        <td>${row.response}</td>
        <td>${row.analysis}</td>
      `;
      tableBody.appendChild(tr);
    });

    generateChart(data);
  } catch (error) {
    console.error('Error fetching responses:', error);
  }
}

// Generate a chart based on the responses
function generateChart(data) {
  const ctx = document.getElementById('response-chart').getContext('2d');
  const labels = data.map(row => row.question);
  const values = data.map(row => row.analysis.length); // Example: Use analysis length as a value

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Analysis Length',
        data: values,
        backgroundColor: 'rgba(0, 116, 224, 0.5)',
        borderColor: 'rgba(0, 116, 224, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// Call fetchResponses when the page loads
fetchResponses();

window.onload = function() {
  loadData();
  loadAnalyzedData();
};
