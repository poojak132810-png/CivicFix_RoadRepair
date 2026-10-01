const API = "http://localhost:3000/api";
let currentUser = null;
let currentRating = 0;
let currentLat = 0;
let currentLng = 0;
let leafletMap = null;
let chartStatus = null;
let chartSeverity = null;
let adminChartStatus = null;
let adminChartSeverity = null;
let statusUpdateId = null;

// ===== PAGE & NAVIGATION =====
function showPage(pageId) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
}

function navigateTo(section) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.getElementById("sec-" + section).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  const nav = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (nav) nav.classList.add("active");
  closeSidebar();
  const loaders = {
    dashboard: () => { loadStats(); loadDashboardCharts(); },
    report: getGPSLocation,
    complaints: loadComplaints,
    livemap: initMap,
    gps: refreshGPS,
    history: loadWorkHistory,
    notes: loadNotes,
    feedback: loadFeedback,
    notifications: loadNotifications,
    emergency: loadEmergency,
    profile: loadProfile,
    admin: loadAdminDashboard,
    adminComplaints: loadAdminComplaints,
    adminUsers: loadAdminUsers,
  };
  if (loaders[section]) loaders[section]();
}

// ===== SIDEBAR =====
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.querySelector(".sidebar-overlay").classList.toggle("open");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.querySelector(".sidebar-overlay").classList.remove("open");
}

// ===== DARK MODE =====
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}
(function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
})();

// ===== HELPERS =====
function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = "alert alert-" + type;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 4000);
}

function getInitial(name) { return name ? name.charAt(0).toUpperCase() : "U"; }

function updateUserUI() {
  if (!currentUser) return;
  const ini = getInitial(currentUser.name);
  ["sidebarInitial", "topbarInitial", "profileInitial"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = ini;
  });
  const sn = document.getElementById("sidebarName");
  if (sn) sn.textContent = currentUser.name;
  const se = document.getElementById("sidebarEmail");
  if (se) se.textContent = currentUser.email;
  // Show admin nav if admin
  const adminNav = document.getElementById("adminNav");
  if (adminNav) adminNav.style.display = currentUser.role === "admin" ? "block" : "none";
  loadNotifCount();
}

function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

function formatDate(d) { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

const svgIcons = {
  road: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  ambulance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 10H6"/><path d="M8 8v4"/><rect x="1" y="6" width="15" height="10" rx="2"/><path d="M16 16h2l3-4V8h-5"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  fire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>',
  traffic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="1" width="12" height="22" rx="2"/><circle cx="12" cy="7" r="2"/><circle cx="12" cy="13" r="2"/><circle cx="12" cy="19" r="1.5"/></svg>',
};

// ===== IMAGE =====
function handleImageSelect(input) {
  const preview = document.getElementById("reportPreview");
  const zone = document.getElementById("uploadZone");
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => { preview.src = e.target.result; preview.style.display = "block"; if (zone) zone.style.display = "none"; };
    reader.readAsDataURL(input.files[0]);
  }
}

// ===== GPS =====
function getGPSLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (p) => {
      currentLat = p.coords.latitude;
      currentLng = p.coords.longitude;
      ["reportLat", "gpsLat"].forEach((id) => { const e = document.getElementById(id); if (e) e.textContent = currentLat.toFixed(6); });
      ["reportLng", "gpsLng"].forEach((id) => { const e = document.getElementById(id); if (e) e.textContent = currentLng.toFixed(6); });
      const acc = document.getElementById("gpsAccuracy");
      if (acc) acc.textContent = p.coords.accuracy.toFixed(1) + " meters";
      const t = document.getElementById("gpsTime");
      if (t) t.textContent = new Date().toLocaleString();
    },
    () => {
      ["reportLat", "gpsLat"].forEach((id) => { const e = document.getElementById(id); if (e) e.textContent = "Unavailable"; });
      ["reportLng", "gpsLng"].forEach((id) => { const e = document.getElementById(id); if (e) e.textContent = "Unavailable"; });
    }
  );
}
function refreshGPS() { getGPSLocation(); }

// ===== AUTH =====
document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const res = await fetch(API + "/register", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: document.getElementById("regName").value, email: document.getElementById("regEmail").value, phone: document.getElementById("regPhone").value, aadhar: document.getElementById("regAadhar").value, password: document.getElementById("regPassword").value }) });
    const data = await res.json();
    if (data.success) { showAlert("registerAlert", data.message, "success"); setTimeout(() => showPage("loginPage"), 1500); }
    else showAlert("registerAlert", data.message, "error");
  } catch { showAlert("registerAlert", "Server connection failed", "error"); }
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const res = await fetch(API + "/login", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: document.getElementById("loginEmail").value, password: document.getElementById("loginPassword").value }) });
    const data = await res.json();
    if (data.success) { currentUser = data.user; updateUserUI(); showPage("appLayout"); navigateTo("dashboard"); }
    else showAlert("loginAlert", data.message, "error");
  } catch { showAlert("loginAlert", "Server connection failed", "error"); }
});

function logout() { currentUser = null; showPage("loginPage"); }

// ===== DASHBOARD STATS =====
async function loadStats() {
  if (!currentUser) return;
  try {
    const data = await (await fetch(API + "/stats/" + currentUser.id)).json();
    if (data.success) {
      document.getElementById("statTotal").textContent = data.stats.totalComplaints;
      document.getElementById("statPending").textContent = data.stats.pending;
      document.getElementById("statResolved").textContent = data.stats.resolved;
      document.getElementById("statFeedback").textContent = data.stats.totalFeedback;
    }
  } catch {}
}

// ===== DASHBOARD CHARTS =====
async function loadDashboardCharts() {
  try {
    if (!currentUser) return;
    const data = await (await fetch(API + "/complaints/user/" + currentUser.id)).json();
    const list = data.complaints || [];

    const statuses = ["Pending", "Acknowledged", "Crew Assigned", "In Progress", "Repair Started", "Resolved"];
    const severities = ["Low", "Medium", "High", "Critical"];
    const s = { statusCount: {}, severityCount: {} };
    statuses.forEach((k) => (s.statusCount[k] = list.filter((c) => c.status === k).length));
    severities.forEach((k) => (s.severityCount[k] = list.filter((c) => c.severity === k).length));

    const colors = { bg: ["#dbeafe", "#fef3c7", "#dcfce7", "#e0e7ff", "#ffedd5", "#fee2e2"], border: ["#1e40af", "#b45309", "#15803d", "#4338ca", "#c2410c", "#b91c1c"] };

    if (chartStatus) chartStatus.destroy();
    chartStatus = new Chart(document.getElementById("chartStatus"), {
      type: "doughnut",
      data: { labels: Object.keys(s.statusCount), datasets: [{ data: Object.values(s.statusCount), backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1.5 }] },
      options: { responsive: true, plugins: { legend: { position: "bottom", labels: { font: { size: 11, family: "Inter" }, padding: 12 } } } },
    });

    if (chartSeverity) chartSeverity.destroy();
    chartSeverity = new Chart(document.getElementById("chartSeverity"), {
      type: "bar",
      data: { labels: Object.keys(s.severityCount), datasets: [{ label: "Count", data: Object.values(s.severityCount), backgroundColor: ["#dcfce7", "#fef3c7", "#ffedd5", "#fee2e2"], borderColor: ["#15803d", "#b45309", "#c2410c", "#b91c1c"], borderWidth: 1.5 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: "Inter" } } }, x: { ticks: { font: { family: "Inter" } } } } },
    });
  } catch {}
}

// ===== REPORT =====
document.getElementById("reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const desc = document.getElementById("reportDesc").value;
  if (!desc) { showAlert("reportAlert", "Please describe the damage", "error"); return; }
  const fd = new FormData();
  const file = document.getElementById("reportImage").files[0] || document.getElementById("reportCapture").files[0];
  if (file) fd.append("image", file);
  fd.append("userId", currentUser ? currentUser.id : 0);
  fd.append("description", desc);
  fd.append("latitude", currentLat);
  fd.append("longitude", currentLng);
  fd.append("address", document.getElementById("reportAddress").value);
  fd.append("severity", document.getElementById("reportSeverity").value);
  try {
    const data = await (await fetch(API + "/complaint", { method: "POST", body: fd })).json();
    if (data.success) { showAlert("reportAlert", data.message, "success"); document.getElementById("reportForm").reset(); document.getElementById("reportPreview").style.display = "none"; document.getElementById("uploadZone").style.display = ""; }
    else showAlert("reportAlert", data.message, "error");
  } catch { showAlert("reportAlert", "Server connection failed", "error"); }
});

// ===== MY COMPLAINTS =====
async function loadComplaints() {
  if (!currentUser) return;
  try {
    const data = await (await fetch(API + "/complaints/user/" + currentUser.id)).json();
    const el = document.getElementById("complaintsList");
    if (!data.complaints.length) { el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><p>No complaints yet</p></div>'; return; }
    el.innerHTML = data.complaints.map((c) => {
      const borderColor = { Critical: "#b91c1c", High: "#c2410c", Medium: "#b45309", Low: "#15803d" }[c.severity] || "#1e40af";
      const upvoted = c.upvotedBy && c.upvotedBy.includes(currentUser.id);
      return `<div class="data-card" style="border-left-color:${borderColor}">
        <div class="card-top"><h4>Complaint #${c.id}</h4><div style="display:flex;gap:4px"><span class="badge badge-${c.severity.toLowerCase()}">${c.severity}</span><span class="badge badge-${c.status.toLowerCase().replace(/ /g, '')}">${c.status}</span></div></div>
        <div class="card-body"><p>${c.description}</p>${c.address ? `<p>Address: ${c.address}</p>` : ""}${c.image ? `<img src="${c.image}" class="card-img" />` : ""}</div>
        <div class="card-meta"><span>GPS: ${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}</span><span>${timeAgo(c.createdAt)}</span></div>
        <div class="card-actions" style="display:flex;gap:8px;align-items:center">
          <button class="upvote-btn ${upvoted ? "upvoted" : ""}" onclick="upvoteComplaint(${c.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>${c.upvotes || 0}</button>
          <button class="btn-timeline" onclick="showTimeline(${c.id})">Timeline</button>
          <button class="btn-delete" onclick="deleteComplaint(${c.id})">Delete</button>
        </div></div>`;
    }).join("");
  } catch {}
}

async function deleteComplaint(id) { try { await fetch(API + "/complaint/" + id, { method: "DELETE" }); loadComplaints(); } catch {} }

async function upvoteComplaint(id) {
  if (!currentUser) return;
  try { await fetch(API + "/complaint/" + id + "/upvote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: currentUser.id }) }); loadComplaints(); } catch {}
}

// ===== TIMELINE MODAL =====
async function showTimeline(id) {
  try {
    const data = await (await fetch(API + "/complaint/" + id)).json();
    if (!data.success) return;
    const tl = data.complaint.timeline || [];
    document.getElementById("timelineContent").innerHTML = `<h4 style="margin-bottom:16px">Complaint #${id} - ${data.complaint.description}</h4>
      <div class="timeline">${tl.map((t) => `<div class="timeline-item"><div class="timeline-dot ${t.status === "Resolved" ? "resolved" : t.status === "Pending" || t.status === "Reported" ? "pending" : ""}"></div>
        <div class="timeline-status">${t.status}</div><div class="timeline-note">${t.note}</div><div class="timeline-date">${formatDate(t.date)}</div></div>`).join("")}</div>`;
    document.getElementById("timelineModal").classList.add("open");
  } catch {}
}
function closeTimelineModal() { document.getElementById("timelineModal").classList.remove("open"); }

// ===== LIVE MAP =====
function initMap() {
  if (!leafletMap) {
    leafletMap = L.map("mapView").setView([12.9716, 77.5946], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "OpenStreetMap" }).addTo(leafletMap);
  }
  setTimeout(() => leafletMap.invalidateSize(), 200);
  loadMapMarkers();
}

async function loadMapMarkers() {
  try {
    const data = await (await fetch(API + "/map/complaints")).json();
    if (!data.success) return;
    leafletMap.eachLayer((l) => { if (l instanceof L.Marker) leafletMap.removeLayer(l); });
    const colors = { Critical: "red", High: "orange", Medium: "gold", Low: "green" };
    data.markers.forEach((m) => {
      const icon = L.divIcon({ className: "", html: `<div style="width:14px;height:14px;border-radius:50%;background:${colors[m.severity] || "blue"};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
      L.marker([m.lat, m.lng], { icon }).addTo(leafletMap)
        .bindPopup(`<strong>${m.address || "Location"}</strong><br>${m.description}<br><small>Severity: ${m.severity} | Status: ${m.status}<br>Upvotes: ${m.upvotes}</small>`);
    });
    if (data.markers.length > 0) {
      const bounds = L.latLngBounds(data.markers.map((m) => [m.lat, m.lng]));
      leafletMap.fitBounds(bounds, { padding: [30, 30] });
    }
  } catch {}
}

// ===== WORK HISTORY =====
async function loadWorkHistory() {
  try {
    const data = await (await fetch(API + "/work-history")).json();
    const el = document.getElementById("historyList");
    if (!data.workHistory.length) { el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>No work history</p></div>'; return; }
    el.innerHTML = data.workHistory.map((w) => `<div class="data-card" style="border-left-color:${w.status === "Completed" ? "#15803d" : "#1e40af"}">
      <div class="card-top"><h4>${w.location}</h4><span class="badge badge-${w.status === "Completed" ? "completed" : "progress"}">${w.status}</span></div>
      <div class="card-body"><p>${w.description}</p></div>
      <div class="card-meta"><span>GPS: ${w.latitude}, ${w.longitude}</span>${w.repairedDate ? `<span>Repaired: ${w.repairedDate}</span>` : ""}</div></div>`).join("");
  } catch {}
}

// ===== NOTES =====
document.getElementById("noteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await (await fetch(API + "/notes", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser?.id || 0, userName: currentUser?.name || "Anonymous", title: document.getElementById("noteTitle").value, content: document.getElementById("noteContent").value }) })).json();
    if (data.success) { showAlert("noteAlert", data.message, "success"); document.getElementById("noteTitle").value = ""; document.getElementById("noteContent").value = ""; loadNotes(); }
    else showAlert("noteAlert", data.message, "error");
  } catch { showAlert("noteAlert", "Connection failed", "error"); }
});

async function loadNotes() {
  try {
    const data = await (await fetch(API + "/notes")).json();
    const el = document.getElementById("notesList");
    if (!data.notes.length) { el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><p>No notes yet</p></div>'; return; }
    el.innerHTML = data.notes.reverse().map((n) => `<div class="data-card"><div class="card-top"><h4>${n.title}</h4><button class="btn-delete" onclick="deleteNote(${n.id})">Delete</button></div><div class="card-body"><p>${n.content}</p></div><div class="card-meta"><span>By ${n.userName}</span><span>${timeAgo(n.createdAt)}</span></div></div>`).join("");
  } catch {}
}
async function deleteNote(id) { try { await fetch(API + "/note/" + id, { method: "DELETE" }); loadNotes(); } catch {} }

// ===== FEEDBACK =====
document.querySelectorAll(".star").forEach((s) => {
  s.addEventListener("click", () => {
    currentRating = parseInt(s.dataset.v);
    document.getElementById("feedbackRating").value = currentRating;
    document.querySelectorAll(".star").forEach((x) => x.classList.toggle("active", parseInt(x.dataset.v) <= currentRating));
  });
});

document.getElementById("feedbackForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentRating) { showAlert("feedbackAlert", "Select a rating", "error"); return; }
  try {
    const data = await (await fetch(API + "/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser?.id || 0, userName: currentUser?.name || "Anonymous", rating: currentRating, comment: document.getElementById("feedbackComment").value }) })).json();
    if (data.success) { showAlert("feedbackAlert", data.message, "success"); document.getElementById("feedbackComment").value = ""; currentRating = 0; document.querySelectorAll(".star").forEach((s) => s.classList.remove("active")); loadFeedback(); }
    else showAlert("feedbackAlert", data.message, "error");
  } catch { showAlert("feedbackAlert", "Connection failed", "error"); }
});

async function loadFeedback() {
  try {
    const data = await (await fetch(API + "/feedback")).json();
    const el = document.getElementById("feedbackList");
    if (!data.feedback.length) { el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><p>No feedback yet</p></div>'; return; }
    el.innerHTML = data.feedback.reverse().map((f) => `<div class="feedback-item"><div class="feedback-stars">${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}</div><div class="feedback-user">${f.userName}</div><div class="feedback-comment">${f.comment}</div><div class="feedback-date">${timeAgo(f.createdAt)}</div></div>`).join("");
  } catch {}
}

// ===== NOTIFICATIONS =====
async function loadNotifCount() {
  if (!currentUser) return;
  try {
    const data = await (await fetch(API + "/notifications/" + currentUser.id)).json();
    const count = data.unread || 0;
    ["topNotifBadge", "sideNotifBadge"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.textContent = count; el.style.display = count > 0 ? "flex" : "none"; }
    });
  } catch {}
}

async function loadNotifications() {
  if (!currentUser) return;
  try {
    const data = await (await fetch(API + "/notifications/" + currentUser.id)).json();
    const el = document.getElementById("notifList");
    if (!data.notifications.length) { el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><p>No notifications</p></div>'; return; }
    el.innerHTML = data.notifications.map((n) => `<div class="notif-item ${n.read ? "" : "unread"}">
      <div class="notif-icon ${n.type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg></div>
      <div><div class="notif-text">${n.message}</div><div class="notif-time">${timeAgo(n.createdAt)}</div></div></div>`).join("");
  } catch {}
}

async function markAllRead() {
  if (!currentUser) return;
  try { await fetch(API + "/notifications/" + currentUser.id + "/read", { method: "PUT" }); loadNotifications(); loadNotifCount(); } catch {}
}

// ===== EMERGENCY =====
async function loadEmergency() {
  try {
    const data = await (await fetch(API + "/emergency-contacts")).json();
    document.getElementById("emergencyList").innerHTML = data.contacts.map((c) => `<div class="emergency-card"><div class="emergency-icon">${svgIcons[c.icon] || svgIcons.road}</div><div class="emergency-info"><h4>${c.name}</h4><a href="tel:${c.number}">${c.number}</a></div></div>`).join("");
  } catch {}
}

// ===== PROFILE =====
function loadProfile() {
  if (!currentUser) return;
  document.getElementById("profileName").textContent = currentUser.name;
  document.getElementById("profileEmail").textContent = currentUser.email;
  document.getElementById("profileNameInput").value = currentUser.name;
  document.getElementById("profilePhone").value = currentUser.phone || "";
  document.getElementById("profileAadhar").value = "";
}

document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await (await fetch(API + "/profile/" + currentUser.id, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: document.getElementById("profileNameInput").value, phone: document.getElementById("profilePhone").value, aadhar: document.getElementById("profileAadhar").value }) })).json();
    if (data.success) { currentUser = { ...currentUser, ...data.user }; updateUserUI(); loadProfile(); showAlert("profileAlert", data.message, "success"); }
    else showAlert("profileAlert", data.message, "error");
  } catch { showAlert("profileAlert", "Connection failed", "error"); }
});

// ===== ADMIN DASHBOARD =====
async function loadAdminDashboard() {
  try {
    const data = await (await fetch(API + "/admin/stats")).json();
    if (!data.success) return;
    const s = data.stats;
    document.getElementById("adminStats").innerHTML = `
      <div class="stat-card stat-blue"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><div class="stat-info"><span class="stat-num">${s.totalUsers}</span><span class="stat-label">Total Users</span></div></div>
      <div class="stat-card stat-amber"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="stat-info"><span class="stat-num">${s.totalComplaints}</span><span class="stat-label">Total Complaints</span></div></div>
      <div class="stat-card stat-green"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div><div class="stat-info"><span class="stat-num">${s.resolved}</span><span class="stat-label">Resolved</span></div></div>
      <div class="stat-card stat-indigo"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div class="stat-info"><span class="stat-num">${s.avgRating}/5</span><span class="stat-label">Avg Rating</span></div></div>`;

    const colors = { bg: ["#dbeafe", "#fef3c7", "#dcfce7", "#e0e7ff", "#ffedd5", "#fee2e2"], border: ["#1e40af", "#b45309", "#15803d", "#4338ca", "#c2410c", "#b91c1c"] };
    if (adminChartStatus) adminChartStatus.destroy();
    adminChartStatus = new Chart(document.getElementById("adminChartStatus"), {
      type: "doughnut",
      data: { labels: Object.keys(s.statusCount), datasets: [{ data: Object.values(s.statusCount), backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1.5 }] },
      options: { responsive: true, plugins: { legend: { position: "bottom", labels: { font: { size: 11, family: "Inter" }, padding: 10 } } } },
    });
    if (adminChartSeverity) adminChartSeverity.destroy();
    adminChartSeverity = new Chart(document.getElementById("adminChartSeverity"), {
      type: "bar",
      data: { labels: Object.keys(s.severityCount), datasets: [{ label: "Count", data: Object.values(s.severityCount), backgroundColor: ["#dcfce7", "#fef3c7", "#ffedd5", "#fee2e2"], borderColor: ["#15803d", "#b45309", "#c2410c", "#b91c1c"], borderWidth: 1.5 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } },
    });
  } catch {}
}

// ===== ADMIN: MANAGE COMPLAINTS =====
async function loadAdminComplaints() {
  const status = document.getElementById("adminFilterStatus").value;
  const severity = document.getElementById("adminFilterSeverity").value;
  const search = document.getElementById("adminSearch").value;
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (severity !== "all") params.set("severity", severity);
  if (search) params.set("search", search);
  try {
    const data = await (await fetch(API + "/complaints?" + params)).json();
    const el = document.getElementById("adminComplaintsList");
    if (!data.complaints.length) { el.innerHTML = '<div class="empty-state"><p>No complaints found</p></div>'; return; }
    el.innerHTML = data.complaints.map((c) => {
      const borderColor = { Critical: "#b91c1c", High: "#c2410c", Medium: "#b45309", Low: "#15803d" }[c.severity] || "#1e40af";
      return `<div class="data-card" style="border-left-color:${borderColor}">
        <div class="card-top"><h4>#${c.id} - ${c.address || "No address"}</h4><div style="display:flex;gap:4px"><span class="badge badge-${c.severity.toLowerCase()}">${c.severity}</span><span class="badge badge-${c.status.toLowerCase().replace(/ /g, '')}">${c.status}</span></div></div>
        <div class="card-body"><p>${c.description}</p>${c.image ? `<img src="${c.image}" class="card-img" />` : ""}</div>
        <div class="card-meta"><span>GPS: ${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}</span><span>Upvotes: ${c.upvotes || 0}</span><span>${formatDate(c.createdAt)}</span></div>
        <div class="card-actions" style="display:flex;gap:8px;margin-top:10px">
          <button class="btn-status" onclick="openStatusModal(${c.id})">Update Status</button>
          <button class="btn-timeline" onclick="showTimeline(${c.id})">Timeline</button>
        </div></div>`;
    }).join("");
  } catch {}
}

// ===== STATUS MODAL =====
function openStatusModal(id) { statusUpdateId = id; document.getElementById("statusModal").classList.add("open"); }
function closeModal() { document.getElementById("statusModal").classList.remove("open"); statusUpdateId = null; }

async function submitStatusUpdate() {
  if (!statusUpdateId) return;
  const status = document.getElementById("modalStatus").value;
  const note = document.getElementById("modalNote").value;
  try {
    await fetch(API + "/admin/complaint/" + statusUpdateId + "/status", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note }) });
    closeModal();
    loadAdminComplaints();
  } catch {}
}

// ===== ADMIN: USERS =====
async function loadAdminUsers() {
  try {
    const data = await (await fetch(API + "/admin/users")).json();
    const el = document.getElementById("adminUsersList");
    el.innerHTML = data.users.map((u) => `<div class="data-card">
      <div class="card-top"><h4>${u.name}</h4><span class="badge badge-${u.role === "admin" ? "completed" : "progress"}">${u.role}</span></div>
      <div class="card-body"><p>Email: ${u.email}</p><p>Phone: ${u.phone}</p><p>Complaints: ${u.complaintsCount}</p></div>
      <div class="card-meta"><span>Joined: ${formatDate(u.createdAt)}</span></div></div>`).join("");
  } catch {}
}