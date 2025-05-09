let currentStep = 0;
const userResponses = {};
const interviewResponses = [];

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
    </div>`;
  chatbox.appendChild(botBubble);
  chatbox.scrollTop = chatbox.scrollHeight;
  return botBubble;
}

function updateProgressIndicator(currentStep, totalSteps) {
  const progressElement = document.getElementById('progress');
  progressElement.textContent = `Question ${currentStep + 1} of ${totalSteps}`;
}

function handleTextQuestion(step) {
  updateProgressIndicator(currentStep, interviewScript.length);
  const chatbox = document.getElementById('chatbox');
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendButton');
  const progress = document.getElementById('progress');

  input.style.display = 'block';
  sendBtn.style.display = 'block';
  input.value = '';

  showBotMessage(step.question);
}

function handleSelectQuestion(step) {
  updateProgressIndicator(currentStep, interviewScript.length);
  const chatbox = document.getElementById('chatbox');
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendButton');

  showBotMessage(step.question);
  const container = document.createElement('div');
  container.id = 'optionButtons';

  step.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.onclick = () => {
      userResponses[step.key] = opt;
      interviewResponses.push({ question: step.question, answer: opt });
      chatbox.innerHTML += `<div class="user-msg"><strong>You:</strong> ${opt}</div>`;
      showBotMessage("Thank you.");
      container.remove();
      currentStep += 1;
      sendNextQuestion();
    };
    container.appendChild(btn);
  });

  chatbox.appendChild(container);
  input.style.display = 'none';
  sendBtn.style.display = 'none';
}

function handleInfoOrAck(step) {
  updateProgressIndicator(currentStep, interviewScript.length);
  showBotMessage(step.message);
  currentStep += 1;
  setTimeout(sendNextQuestion, 1000);
}

// Update sendNextQuestion to use these modular functions
function sendNextQuestion() {
  const step = interviewScript[currentStep];
  if (!step) return;

  const typingBubble = showBotMessage('', true);
  setTimeout(() => {
    typingBubble.remove();

    if (step.type === 'text') {
      handleTextQuestion(step);
    } else if (step.type === 'select') {
      handleSelectQuestion(step);
    } else if (['info', 'ack'].includes(step.type)) {
      handleInfoOrAck(step);
    } else if (step.type === 'end') {
      showBotMessage(step.message);
      document.getElementById('userInput').style.display = 'none';
      document.getElementById('sendButton').style.display = 'none';
      saveAllResponses();
    }
  }, 1200);
}

function sendMessage() {
  const input = document.getElementById('userInput');
  const message = input.value.trim();
  if (!message) return;

  const step = interviewScript[currentStep];
  if (!step || step.type !== 'text') return;

  const chatbox = document.getElementById('chatbox');
  chatbox.innerHTML += `<div class="user-msg"><strong>You:</strong> ${message}</div>`;
  input.value = '';

  userResponses[step.key] = message;
  interviewResponses.push({ question: step.question, answer: message });
  currentStep++;
  sendNextQuestion();
}

function saveAllResponses() {
  const payload = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    responses: interviewResponses
  };

  console.log('Sending full payload to server:', payload); // ✅ ADD THIS LINE
  
  fetch('/save-response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      console.log('Saved full interview:', data);
      showStartNewInterviewButton();
    })
    .catch(err => {
      console.error('Failed to save interview:', err);
      alert('Saving failed.');
    });
}

function showStartNewInterviewButton() {
  const chatbox = document.getElementById('chatbox');
  const button = document.createElement('button');
  button.textContent = 'Start New Interview';
  button.id = 'startNewInterviewButton';
  button.onclick = resetInterview;
  chatbox.appendChild(button);
}

function resetInterview() {
  currentStep = 0;
  Object.keys(userResponses).forEach(k => delete userResponses[k]);
  interviewResponses.length = 0;
  document.getElementById('chatbox').innerHTML = '';
  sendNextQuestion();
}

// Onboarding modal + flow start
window.onload = function () {
  const modal = document.getElementById('onboardingModal');
  if (modal) {
    let step = 0;
    const text = document.getElementById('modalText');
    const btn = document.getElementById('nextModalBtn');
    const termsBlock = document.getElementById('termsBlock');
    const checkbox = document.getElementById('consentCheckbox');

    const steps = [
      "Hi there! Thank you for participating in this InsightFlow interview.<br><br>It will take around <strong>5 minutes</strong>. Click <strong>Next</strong> to continue.",
      "You'll be asked questions about your background and thoughts on a product.<br><br>Click <strong>Next</strong> to continue.",
      "Before we begin, please agree to the <strong>Terms and Privacy Policy</strong>."
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

