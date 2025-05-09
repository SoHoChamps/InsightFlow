let currentStep = 0;
const userResponses = {};

const interviewScript = [
  { type: 'text', key: 'fullName', question: "What is your first and last name?" },
  { type: 'text', key: 'dob', question: "What is your date of birth? (mm/dd/yyyy)" },
  { type: 'select', key: 'ethnicity', question: "What is your ethnicity?", options: ["Asian", "Black", "Hispanic", "White", "Mixed", "Other"] },
  { type: 'select', key: 'gender', question: "What is your gender?", options: ["Male", "Female", "Other", "Prefer not to say"] },
  { type: 'text', key: 'country', question: "What country are you from?" },
  { type: 'info', message: "Now we will move on to the product-specific questions." },
  { type: 'text', key: 'satisfaction', question: "How satisfied were you with the product from 1 to 5 (5 = very satisfied)?" },
  { type: 'text', key: 'usage', question: "What did you use the product for?" },
  { type: 'text', key: 'likes', question: "What did you like most about it?" },
  { type: 'text', key: 'dislikes', question: "What did you not you like about it?" },
  { type: 'text', key: 'improvements', question: "What would you improve or change?" },
  { type: 'text', key: 'contextLocation', question: "Where were you when you used the product?" },
  { type: 'text', key: 'contextOthers', question: "Was anyone else involved in the decision or experience?" },
  { type: 'text', key: 'discovery', question: "How did you first hear about this product?" },
  { type: 'end', message: "Thank you for your time! Your answers have been recorded." }
];

function showBotMessage(msg, isTyping = false) {
  const chatbox = document.getElementById('chatbox');
  const botBubble = document.createElement('div');
  botBubble.className = 'bot-msg';

  botBubble.innerHTML = `
    <div class="bot-avatar">
      <img src="Pictures/Bot.jpg" alt="Bot Avatar" />
    </div>
    <div class="bot-text">
      <strong>InsightFlow:</strong>
      ${isTyping ? '<span class="typing"><span class="dot-1">.</span><span class="dot-2">.</span><span class="dot-3">.</span></span>' : msg}
    </div>
  `;

  chatbox.appendChild(botBubble);
  chatbox.scrollTop = chatbox.scrollHeight;
  return botBubble;
}

function sendNextQuestion() {
  const chatbox = document.getElementById('chatbox');
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendButton');
  const progress = document.getElementById('progress');

  input.style.display = 'block';
  sendBtn.style.display = 'block';
  input.value = '';

  const step = interviewScript[currentStep];
  if (!step) return;

  const totalSteps = interviewScript.filter(s => !['ack', 'info', 'end'].includes(s.type)).length;
  const currentProgress = interviewScript.slice(0, currentStep).filter(s => !['ack', 'info'].includes(s.type)).length + 1;
  progress.innerText = `Step ${currentProgress} of ${totalSteps}`;

  const typingBubble = showBotMessage('', true);

  setTimeout(() => {
    typingBubble.remove();

    if (step.type === 'text') {
      showBotMessage(step.question);
    }

    if (step.type === 'select') {
      showBotMessage(step.question);
      const container = document.createElement('div');
      container.id = 'optionButtons';

      step.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt;
        btn.onclick = () => {
          userResponses[step.key] = opt;
          chatbox.innerHTML += `<div class="user-msg"><strong>You:</strong> ${opt}</div>`;
          showBotMessage("Thank you.");
          container.remove();
          currentStep += 2;
          sendNextQuestion();
        };
        container.appendChild(btn);
      });

      chatbox.appendChild(container);
      input.style.display = 'none';
      sendBtn.style.display = 'none';
      return;
    }

    if (step.type === 'ack' || step.type === 'info') {
      showBotMessage(step.message);
      currentStep++;
      setTimeout(sendNextQuestion, 800);
    }

    if (step.type === 'end') {
      showBotMessage(step.message);
      input.style.display = 'none';
      sendBtn.style.display = 'none';
      console.log("Final responses:", userResponses);
      saveAllResponses(); // Automatically save all responses
    }
  }, 1500);
}

// Save progress to localStorage whenever a response is entered
function saveProgressToLocalStorage() {
  localStorage.setItem('userResponses', JSON.stringify(userResponses));
}

// Load progress from localStorage when the page loads
function loadProgressFromLocalStorage() {
  const savedResponses = localStorage.getItem('userResponses');
  if (savedResponses) {
    Object.assign(userResponses, JSON.parse(savedResponses));
  }
}

// Update save logic to include saving progress to localStorage
function sendMessage() {
  const input = document.getElementById('userInput');
  const message = input.value.trim();
  if (!message) return;

  const chatbox = document.getElementById('chatbox');
  chatbox.innerHTML += `<div class="user-msg"><strong>You:</strong> ${message}</div>`;
  input.value = '';

  const step = interviewScript[currentStep];
  if (step?.type === 'text') {
    userResponses[step.key] = message;
    saveProgressToLocalStorage(); // Save progress after each response
    currentStep++;
    sendNextQuestion();
  }
}

function saveResponse(responseData) {
  fetch('/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(responseData)
  })
  .then(res => res.json())
  .then(data => console.log('Saved:', data))
  .catch(err => console.error('Save failed:', err));
}

function saveAndAnalyzeResponse(responseData) {
  fetch('/save-and-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: responseData })
  })
  .then(res => res.json())
  .then(data => console.log('Saved and analyzed:', data))
  .catch(err => console.error('Save and analyze failed:', err));
}

function saveUserInput(input) {
  fetch('/save-input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input })
  })
  .then(res => res.json())
  .then(data => console.log('Input saved with ID:', data.id))
  .catch(err => console.error('Failed to save input:', err));
}

// Function to save user responses to the backend
async function saveResponse(question, response) {
  try {
    await fetch('/save-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, response })
    });
  } catch (error) {
    console.error('Error saving response:', error);
  }
}

// Automatically submit all responses when the final question is answered
function saveAllResponses() {
  fetch('/save-response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userResponses)
  })
    .then(res => res.json())
    .then(data => {
      console.log('All responses saved:', data);
      alert('All responses have been saved successfully!');
    })
    .catch(err => {
      console.error('Error saving responses:', err);
      alert('Failed to save responses. Please try again.');
    });
}

// Function to load saved responses and populate the dashboard
async function loadResponses() {
  try {
    const response = await fetch('/responses');
    const data = await response.json();

    // Populate the dashboard with saved data
    const tableBody = document.querySelector('#response-table tbody');
    tableBody.innerHTML = '';

    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.question}</td>
        <td>${row.response}</td>
        <td>${row.analysis || 'Pending Analysis'}</td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error loading responses:', error);
  }
}

// Call loadResponses when the dashboard page loads
if (window.location.pathname.includes('dashboard.html')) {
  document.addEventListener('DOMContentLoaded', loadResponses);
}

// Save responses when the user submits them in the interview page
if (window.location.pathname.includes('interview.html')) {
  document.querySelectorAll('.question-form').forEach(form => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const question = form.querySelector('.question').textContent;
      const response = form.querySelector('.response').value;
      await saveResponse(question, response);
      alert('Response saved!');
    });
  });
}

// Load progress when the page loads
if (window.location.pathname.includes('interview.html')) {
  document.addEventListener('DOMContentLoaded', loadProgressFromLocalStorage);
}

window.onload = function () {
  const modal = document.getElementById('onboardingModal');
  if (modal) {
    let step = 0;
    const text = document.getElementById('modalText');
    const btn = document.getElementById('nextModalBtn');
    const termsBlock = document.getElementById('termsBlock');
    const checkbox = document.getElementById('consentCheckbox');

    const steps = [
      `Hi there! Thank you for participating in this InsightFlow interview.<br><br>It will take around <strong>5 minutes</strong>. Before we begin, here's a quick overview of how it works.<br><br>Click <strong>Next</strong> to continue.`,
      `You'll be asked a few questions about your <strong>background</strong> and then your <strong>thoughts on a product</strong>.<br><br>Please keep your answers short and clear, one or two sentences is perfect.<br><br>Click <strong>Next</strong> to continue.`,
      `Before we begin, please confirm that you have read and agree to our <strong>Terms and Conditions</strong> and <strong>Privacy Policy</strong>.<br><br><strong>Check the box below and then click <strong>Begin</strong>.</strong>`
    ];

    text.innerHTML = steps[step];
    modal.style.display = 'flex';
    btn.innerText = "Next";

    btn.addEventListener('click', () => {
      if (step === 2 && !checkbox.checked) {
        alert("Please agree to the terms and privacy policy.");
        return;
      }

      step++;
      if (step < steps.length) {
        text.innerHTML = steps[step];
        if (step === 2) {
          termsBlock.style.display = 'block';
          btn.innerText = "Begin";
          btn.disabled = true;
        }
      } else {
        modal.style.display = 'none';
        sendNextQuestion();
      }
    });

    checkbox?.addEventListener('change', () => {
      btn.disabled = !checkbox.checked;
    });
  } else {
    sendNextQuestion();
  }

  document.getElementById('sendButton').addEventListener('click', sendMessage);
};
