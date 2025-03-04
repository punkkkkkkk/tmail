let currentMessageId = null; // Tracks the currently open email
let fetchInterval = null;    // Holds the interval ID for fetching inbox
let currentEmailAccount = null; // Tracks the active email account

// Helper function to generate a meaningful username.
function generateMeaningfulUsername() {
  const adjectives = ["thick", "wacky", "quirky", "goofy", "silly",  "bizarre", "droll", "fat", "nutty", "kooky", "bloody", "prick", "hard", "comical", "shitty", "golden","hot"];
  const animals = ["lion", "tiger", "bear", "fox", "eagle", "wolf", "panther", "leopard", "cheetah", "falcon", "dragon", "table", "griffin", "sword", "shield", "thunder", "guy", "storm", "foot", "leg"];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const number = Math.floor(Math.random() * 100);
  return `${adjective}${animal}${number}`;
}

// Updates the email display with a copy button (using the old clipboard symbol) with no gap.
function updateEmailDisplay(email) {
  const emailElement = document.getElementById("email");
  emailElement.innerHTML = `
    <div class="email-container" style="display: inline-flex; flex-direction: column; align-items: center;">
      <div style="display: inline-flex; align-items: center;">
        <button id="copyBtn" title="Copy Email" style="border: none; background: transparent; color: inherit; cursor: pointer; padding: 5px; margin: 0; font-size: 16px;">📋</button>
        <span style="margin-left: 0;">${email}</span>
      </div>
    </div>`;
  document.getElementById("copyBtn").addEventListener("click", function() {
    navigator.clipboard.writeText(email).then(() => {
      // Create the "Copied" message element.
      const copyMsg = document.createElement("span");
      copyMsg.textContent = "Copied!!!";
      copyMsg.style.opacity = "0";
      copyMsg.style.transition = "opacity 1s ease";
      copyMsg.style.display = "block"; // Make it a block element so it appears below
      copyMsg.style.marginTop = "8px";
      
      // Append the message within the container.
      const container = emailElement.querySelector(".email-container");
      container.appendChild(copyMsg);
      
      // Force reflow
      void copyMsg.offsetWidth;
      
      // Fade in the message.
      copyMsg.style.opacity = "1";
      
      // Fade out and remove the message after 1 second.
      setTimeout(() => {
        copyMsg.style.opacity = "0";
        setTimeout(() => { copyMsg.remove(); }, 1000);
      }, 1000);
    }).catch(err => {
      console.error("Failed to copy text: ", err);
    });
  });
}


document.addEventListener("DOMContentLoaded", function() {
  // Check for stored email and start fetching if available.
  chrome.storage.local.get(["email", "password"], function(result) {
    if (result.email && result.password) {
      updateEmailDisplay(result.email);
      startFetching(result.email, result.password);
    } else {
      document.getElementById("email").textContent = "Click 'Generate Email' to create a new temporary email.";
    }
  });

  // Generate Email button event listener.
  document.getElementById("generate").addEventListener("click", async function() {
    chrome.storage.local.get(["email"], async function(result) {
      if (result.email) {
        updateEmailDisplay(result.email);
        return;
      } else {
        createNewEmail();
      }
    });
  });

  // "Create New Mail" button clears stored data and resets the UI.
  document.getElementById("newMail").addEventListener("click", function() {
    if (fetchInterval) {
      clearInterval(fetchInterval);
      fetchInterval = null;
    }
    chrome.storage.local.remove(["email", "password"], function() {
      document.getElementById("email").textContent = "Click 'Generate Email' to create a new temporary email.";
      document.getElementById("emailContent").style.display = "none";
      document.getElementById("inbox").innerHTML = "";
      currentMessageId = null;
      currentEmailAccount = null;
    });
  });

  async function createNewEmail() {
    const emailDisplay = document.getElementById("email");
    // Clear existing inbox and any active interval.
    document.getElementById("inbox").innerHTML = "";
    if (fetchInterval) {
      clearInterval(fetchInterval);
      fetchInterval = null;
    }
    emailDisplay.textContent = "Generating...";
    try {
      let domainData = await fetch("https://api.mail.tm/domains").then(res => res.json());
      let selectedDomain = domainData["hydra:member"][0].domain;
      let username = generateMeaningfulUsername();
      let email = `${username}@${selectedDomain}`;
      let password = "password123";

      await fetch("https://api.mail.tm/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: email, password: password })
      });

      chrome.storage.local.set({ email: email, password: password });
      updateEmailDisplay(email);
      startFetching(email, password);
    } catch (error) {
      emailDisplay.textContent = "Error fetching email.";
    }
  }

  function startFetching(email, password) {
    // If switching accounts, clear the previous interval.
    if (currentEmailAccount !== email && fetchInterval) {
      clearInterval(fetchInterval);
      fetchInterval = null;
    }
    currentEmailAccount = email;
    fetchInbox(email, password);
    fetchInterval = setInterval(() => {
      fetchInbox(email, password);
    }, 10000);
  }

  async function fetchInbox(email, password) {
    try {
      let tokenRes = await fetch("https://api.mail.tm/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: email, password: password })
      });
      let tokenData = await tokenRes.json();
      let token = tokenData.token;

      let messagesRes = await fetch("https://api.mail.tm/messages", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      let messages = await messagesRes.json();

      let inboxList = document.getElementById("inbox");
      // Clear inbox before appending new items.
      inboxList.innerHTML = "";
      messages["hydra:member"].forEach(msg => {
        let listItem = document.createElement("li");
        listItem.textContent = `${msg.from.address}: ${msg.subject}`;
        listItem.style.cursor = "pointer";
        listItem.addEventListener("click", () => {
          let emailContentDiv = document.getElementById("emailContent");
          // Toggle behavior: if clicking the same mail heading, hide the viewer.
          if (currentMessageId === msg.id && emailContentDiv.style.display === "block") {
            emailContentDiv.style.display = "none";
            currentMessageId = null;
          } else {
            currentMessageId = msg.id;
            fetchMessageContent(msg.id, token);
          }
        });
        inboxList.appendChild(listItem);
      });
    } catch (error) {
      console.log("Error fetching inbox:", error);
    }
  }

  async function fetchMessageContent(messageId, token) {
    try {
      let response = await fetch(`https://api.mail.tm/messages/${messageId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      let messageDetail = await response.json();
      displayMessageDetail(messageDetail);
    } catch (error) {
      console.log("Error fetching message content:", error);
    }
  }

  function displayMessageDetail(message) {
    // Create the modal overlay element.
    const modal = document.createElement("div");
    modal.className = "email-modal";
    
    // Extract email details with fallbacks.
    const sender = message.from && message.from.address ? message.from.address : "Unknown sender";
    const subject = message.subject || "No subject";
    const bodyContent = message.text || message.html || "No content available";
    
    // Build the modal content (email card) without an internal close button.
    modal.innerHTML = `
      <div class="email-card">
        <div class="email-header">
          <div class="sender"><strong>From:</strong> ${sender}</div>
          <div class="subject"><strong>Subject:</strong> ${subject}</div>
        </div>
        <div class="email-body">
          ${formatEmailContent(bodyContent)}
        </div>
      </div>
    `;
    
    // Create the external close button.
    const closeBtn = document.createElement("button");
    closeBtn.className = "close-modal";
    closeBtn.textContent = "Close";
    
    // Append the close button to the modal overlay (outside the email card).
    modal.appendChild(closeBtn);
    
    // Event listener to close the modal.
    closeBtn.addEventListener("click", () => {
      modal.remove();
    });
    
    // Append the modal overlay to the document body.
    document.body.appendChild(modal);
  }
  
  

  

  function formatEmailContent(content) {
    // Replace single newlines (not part of a double newline) with a space.
    content = content.replace(/([^\n])\n(?!\n)/g, '$1 ');
    
    // Process images and links as before.
    content = content.replace(/(https?:\/\/[^\s\[\]]+\.(png|jpg|jpeg|gif))/gi, '<img src="$1" alt="Image">');
    content = content.replace(/\[(https?:\/\/[^\]]+)\]/gi, '<a href="$1" target="_blank">Link</a>');
    content = content.replace(/\[Image\]/gi, '');
    content = content.replace(/\[Link\]/gi, '');
    content = content.replace(/[\[\]]/g, '');
    
    return content;
  }
  
});
