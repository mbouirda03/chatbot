// Liste de toutes les ressources Réseau
const reseauResources = [
  {
    id: "ch1",
    title: "S33 - Chapitre 1 : Conception d'un réseau local",
    type: "Cours",
    level: "S33",
    icon: "📘",
    url: "https://bts-chatbot-courses.s3.us-east-1.amazonaws.com/S33_Ch1_Conception+d'un+r%C3%A9seau+local.ppt"
  },
  {
    id: "ch3",
    title: "S33 - Chapitre 3 : Réseaux Locaux Virtuels (VLAN)",
    type: "Cours",
    level: "S33",
    icon: "📘",
    url: "https://bts-chatbot-courses.s3.us-east-1.amazonaws.com/S33_Ch3_R%C3%A9seaux+Locaux+Virtuels(VLAN).pptx"
  },
  {
    id: "ch5",
    title: "S33 - Chapitre 5 : Protocole STP",
    type: "Cours",
    level: "S33",
    icon: "📘",
    url: "https://bts-chatbot-courses.s3.us-east-1.amazonaws.com/S33_Ch5_Protocole+STP.pptx"
  }
  // ➕ ajoute ici d'autres TD / TP si tu veux
];

const grid = document.getElementById("reseauGrid");

reseauResources.forEach((item) => {
  const card = document.createElement("article");
  card.className = "card";

  card.innerHTML = `
    <div class="card-header">
      <div class="card-icon">${item.icon}</div>
      <div>
        <div class="card-title">${item.title}</div>
        <div class="card-meta">${item.level} • ${item.type}</div>
      </div>
    </div>
    <div class="card-footer">
      <span class="tag">${item.type}</span>
      <button class="open-btn">
        📎 Ouvrir
      </button>
    </div>
  `;

  const btn = card.querySelector(".open-btn");
  btn.addEventListener("click", () => {
    window.open(item.url, "_blank");
  });

  grid.appendChild(card);
});
