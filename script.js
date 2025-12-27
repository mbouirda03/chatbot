// 👉 Your Lambda HTTP endpoint
const API_URL = "https://dh155852gh.execute-api.us-east-1.amazonaws.com/chat";

// DOM elements
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const resetButton = document.getElementById("resetButton");

// Session id (just an ID string for Lambda)
let sessionId = localStorage.getItem("bts_session_id");
if (!sessionId) {
  sessionId = "user_" + Date.now();
  localStorage.setItem("bts_session_id", sessionId);
}

// ---------- UI helpers ----------

function addMessage(content, isUser = false, buttons = null) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user" : "bot"}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = isUser ? "👤" : "🤖";

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  messageContent.innerHTML = content.replace(/\n/g, "<br>");

  if (buttons && buttons.length > 0) {
    const buttonGroup = document.createElement("div");
    buttonGroup.className = "button-group";

    buttons.forEach((btn) => {
      const button = document.createElement("button");
      button.className = "option-button";
      button.innerHTML = `${btn.icon || ""} ${btn.label}`;
      button.onclick = () => handleButtonClick(btn.value);
      buttonGroup.appendChild(button);
    });

    messageContent.appendChild(buttonGroup);
  }

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(messageContent);
  chatMessages.appendChild(messageDiv);

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
  const typingDiv = document.createElement("div");
  typingDiv.className = "message bot";
  typingDiv.id = "typing";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "🤖";

  const typingIndicator = document.createElement("div");
  typingIndicator.className = "typing-indicator";
  typingIndicator.style.display = "flex";
  typingIndicator.innerHTML = "<span></span><span></span><span></span>";

  typingDiv.appendChild(avatar);
  typingDiv.appendChild(typingIndicator);
  chatMessages.appendChild(typingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const typing = document.getElementById("typing");
  if (typing) typing.remove();
}

function handleButtonClick(value) {
  sendMessage(value);
}

// ---------- Talk to Lambda ----------

async function sendMessage(message = null) {
  const msg = message || chatInput.value.trim();
  if (msg === "") return;

  addMessage(msg, true);
  if (!message) chatInput.value = "";

  showTypingIndicator();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        sessionId: sessionId,
      }),
    });

    let data = await res.json();
    console.log("API raw data:", data);

    let payload = { response: null, buttons: [], enableInput: false };

    // Case 1: direct {response, buttons}
    if (typeof data === "object" && (data.response || data.buttons)) {
      payload.response = data.response || null;
      payload.buttons = data.buttons || [];
      if (typeof data.enableInput === "boolean") {
        payload.enableInput = data.enableInput;
      } else {
        // Fallback if backend doesn't send enableInput
        payload.enableInput = shouldEnableInput(payload.buttons, payload.response);
      }
    }
    // Case 2: wrapped { statusCode, body: "json string" }
    else if (data && typeof data === "object" && data.body) {
      try {
        const inner = JSON.parse(data.body);
        payload.response = inner.response || null;
        payload.buttons = inner.buttons || [];
        if (typeof inner.enableInput === "boolean") {
          payload.enableInput = inner.enableInput;
        } else {
          // Fallback if backend doesn't send enableInput
          payload.enableInput = shouldEnableInput(payload.buttons, payload.response);
        }
      } catch (e) {
        console.error("Error parsing inner body:", e);
      }
    }
    // Case 3: plain string
    else if (typeof data === "string") {
      payload.response = data;
      // If plain string, maybe enable input by default or keep it disabled?
      // Usually errors or simple messages. Let's enable to be safe.
      payload.enableInput = true;
    }

    removeTypingIndicator();

    const text = payload.response || "Pas de réponse.";
    const buttons = payload.buttons || [];

    addMessage(text, false, buttons);

    // Update input state
    chatInput.disabled = !payload.enableInput;
    sendButton.disabled = !payload.enableInput;
    
    // Update placeholder text based on state
    if (payload.enableInput) {
      chatInput.placeholder = "Tapez votre message...";
      chatInput.focus();
    } else {
      chatInput.placeholder = "Sélectionnez un module...";
    }
  } catch (err) {
    console.error(err);
    removeTypingIndicator();
    addMessage("Erreur de connexion au serveur.", false);
  }
}

// ---------- Reset & init ----------

function resetSession() {
  sessionId = "user_" + Date.now();
  localStorage.setItem("bts_session_id", sessionId);
  chatMessages.innerHTML = "";
  
  // Reset input state and placeholder
  chatInput.disabled = true;
  sendButton.disabled = true;
  chatInput.placeholder = "Sélectionnez un module...";
  
  addMessage(
    "Session réinitialisée ! 🎓 Je suis votre assistant éducatif. Tapez 'start' pour recommencer."
  );
  sendMessage("start");
}

// Initial welcome + auto start
addMessage(
  "Bienvenue ! 🎓 Je suis votre assistant éducatif pour SRI, CG et ELT. Tapez 'start' pour commencer."
);
sendMessage("__start__");

// Events
sendButton.addEventListener("click", () => sendMessage());
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});
resetButton.addEventListener("click", resetSession);

// Fallback logic to determine if input should be enabled
function shouldEnableInput(buttons, text) {
  // If no buttons, likely a final answer or error -> enable input
  if (!buttons || buttons.length === 0) return true;

  // Check for known "Step 1" or "Step 2" buttons
  const disabledValues = ["sri", "cg", "elt", "reseau", "linux", "windows", "comptabilite", "electrotechnique"];
  
  // If any button matches a "setup" step value, disable input
  const hasSetupButton = buttons.some(btn => disabledValues.includes(btn.value));
  if (hasSetupButton) return false;

  // Check text for "Choisissez" prompts
  if (text && (text.includes("Choisissez votre filière") || text.includes("Choisissez un module"))) {
    return false;
  }

  // Otherwise (e.g. "cours", "td", "tp"), enable input
  return true;
}
