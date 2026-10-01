const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, "database.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "../frontend")));

function readDB() { return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")); }
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }
function nextId(arr) { return arr.length > 0 ? Math.max(...arr.map((i) => i.id)) + 1 : 1; }

function addNotification(db, userId, message, type) {
  if (!db.notifications) db.notifications = [];
  db.notifications.push({
    id: nextId(db.notifications),
    userId,
    message,
    type: type || "info",
    read: false,
    createdAt: new Date().toISOString(),
  });
}

// ===================== AUTH =====================

app.post("/api/register", (req, res) => {
  const { name, email, phone, aadhar, password } = req.body;
  if (!name || !email || !phone || !password)
    return res.status(400).json({ success: false, message: "All fields are required" });
  const db = readDB();
  if (db.users.find((u) => u.email === email))
    return res.status(400).json({ success: false, message: "Email already registered" });
  const user = { id: nextId(db.users), name, email, phone, aadhar: aadhar || "", password, role: "user", createdAt: new Date().toISOString() };
  db.users.push(user);
  addNotification(db, user.id, "Welcome to RoadFix! Start reporting road issues.", "success");
  writeDB(db);
  res.json({ success: true, message: "Registration Successful", user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email and password are required" });
  const db = readDB();
  const user = db.users.find((u) => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ success: false, message: "Invalid email or password" });
  res.json({ success: true, message: "Login Successful", user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role || "user" } });
});

// ===================== PROFILE =====================

app.put("/api/profile/:userId", (req, res) => {
  const { name, phone, aadhar } = req.body;
  const db = readDB();
  const user = db.users.find((u) => u.id === parseInt(req.params.userId));
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  if (name) user.name = name;
  if (phone) user.phone = phone;
  if (aadhar) user.aadhar = aadhar;
  writeDB(db);
  res.json({ success: true, message: "Profile Updated", user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

// ===================== DASHBOARD STATS =====================

app.get("/api/stats/:userId", (req, res) => {
  const db = readDB();
  const uid = parseInt(req.params.userId);
  const my = db.complaints.filter((c) => c.userId === uid);
  res.json({
    success: true,
    stats: {
      totalComplaints: my.length,
      pending: my.filter((c) => c.status === "Pending").length,
      resolved: my.filter((c) => c.status === "Resolved").length,
      inProgress: my.filter((c) => c.status === "In Progress").length,
      totalRepairs: db.workHistory.length,
      totalFeedback: db.feedback.length,
    },
  });
});

// ===================== ADMIN STATS =====================

app.get("/api/admin/stats", (req, res) => {
  const db = readDB();
  const c = db.complaints;
  const severityCount = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  const statusCount = { Pending: 0, Acknowledged: 0, "Crew Assigned": 0, "In Progress": 0, "Repair Started": 0, Resolved: 0 };
  const monthlyData = {};

  c.forEach((comp) => {
    if (severityCount[comp.severity] !== undefined) severityCount[comp.severity]++;
    if (statusCount[comp.status] !== undefined) statusCount[comp.status]++;
    const month = new Date(comp.createdAt).toLocaleString("default", { month: "short", year: "numeric" });
    monthlyData[month] = (monthlyData[month] || 0) + 1;
  });

  res.json({
    success: true,
    stats: {
      totalUsers: db.users.filter((u) => u.role !== "admin").length,
      totalComplaints: c.length,
      pending: c.filter((x) => x.status === "Pending").length,
      inProgress: c.filter((x) => ["In Progress", "Crew Assigned", "Acknowledged", "Repair Started"].includes(x.status)).length,
      resolved: c.filter((x) => x.status === "Resolved").length,
      totalFeedback: db.feedback.length,
      avgRating: db.feedback.length > 0 ? (db.feedback.reduce((a, f) => a + f.rating, 0) / db.feedback.length).toFixed(1) : "0",
      severityCount,
      statusCount,
      monthlyData,
    },
  });
});

// ===================== ADMIN: ALL USERS =====================

app.get("/api/admin/users", (req, res) => {
  const db = readDB();
  const users = db.users.map((u) => ({
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role || "user",
    complaintsCount: db.complaints.filter((c) => c.userId === u.id).length,
    createdAt: u.createdAt,
  }));
  res.json({ success: true, users });
});

// ===================== COMPLAINTS =====================

app.post("/api/complaint", upload.single("image"), (req, res) => {
  const { userId, description, latitude, longitude, address, severity } = req.body;
  if (!description) return res.status(400).json({ success: false, message: "Description is required" });
  const db = readDB();
  const complaint = {
    id: nextId(db.complaints),
    userId: parseInt(userId) || 0,
    description,
    latitude: parseFloat(latitude) || 0,
    longitude: parseFloat(longitude) || 0,
    address: address || "",
    severity: severity || "Medium",
    image: req.file ? "/uploads/" + req.file.filename : "",
    status: "Pending",
    timeline: [{ status: "Reported", date: new Date().toISOString(), note: "Complaint registered by user" }],
    upvotes: 0,
    upvotedBy: [],
    createdAt: new Date().toISOString(),
  };
  db.complaints.push(complaint);
  addNotification(db, parseInt(userId), "Your complaint #" + complaint.id + " has been registered.", "info");
  writeDB(db);
  res.json({ success: true, message: "Complaint Submitted Successfully", complaint });
});

app.get("/api/complaints", (req, res) => {
  const db = readDB();
  let complaints = [...db.complaints];
  const { status, severity, search, sort } = req.query;
  if (status && status !== "all") complaints = complaints.filter((c) => c.status === status);
  if (severity && severity !== "all") complaints = complaints.filter((c) => c.severity === severity);
  if (search) {
    const q = search.toLowerCase();
    complaints = complaints.filter((c) => c.description.toLowerCase().includes(q) || (c.address && c.address.toLowerCase().includes(q)));
  }
  if (sort === "upvotes") complaints.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
  else if (sort === "severity") {
    const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    complaints.sort((a, b) => (order[a.severity] || 2) - (order[b.severity] || 2));
  } else complaints.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, complaints });
});

app.get("/api/complaints/user/:userId", (req, res) => {
  const db = readDB();
  res.json({ success: true, complaints: db.complaints.filter((c) => c.userId === parseInt(req.params.userId)).reverse() });
});

app.get("/api/complaint/:id", (req, res) => {
  const db = readDB();
  const c = db.complaints.find((x) => x.id === parseInt(req.params.id));
  if (!c) return res.status(404).json({ success: false, message: "Not found" });
  const user = db.users.find((u) => u.id === c.userId);
  res.json({ success: true, complaint: { ...c, userName: user ? user.name : "Unknown" } });
});

app.delete("/api/complaint/:id", (req, res) => {
  const db = readDB();
  const idx = db.complaints.findIndex((c) => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found" });
  db.complaints.splice(idx, 1);
  writeDB(db);
  res.json({ success: true, message: "Complaint Deleted" });
});

// ===================== ADMIN: UPDATE STATUS =====================

app.put("/api/admin/complaint/:id/status", (req, res) => {
  const { status, note } = req.body;
  const db = readDB();
  const c = db.complaints.find((x) => x.id === parseInt(req.params.id));
  if (!c) return res.status(404).json({ success: false, message: "Not found" });
  c.status = status;
  if (!c.timeline) c.timeline = [];
  c.timeline.push({ status, date: new Date().toISOString(), note: note || "Status updated to " + status });
  addNotification(db, c.userId, "Complaint #" + c.id + " status updated to: " + status, status === "Resolved" ? "success" : "info");
  writeDB(db);
  res.json({ success: true, message: "Status Updated", complaint: c });
});

// ===================== UPVOTE =====================

app.post("/api/complaint/:id/upvote", (req, res) => {
  const { userId } = req.body;
  const db = readDB();
  const c = db.complaints.find((x) => x.id === parseInt(req.params.id));
  if (!c) return res.status(404).json({ success: false, message: "Not found" });
  if (!c.upvotedBy) c.upvotedBy = [];
  const uid = parseInt(userId);
  if (c.upvotedBy.includes(uid)) {
    c.upvotedBy = c.upvotedBy.filter((id) => id !== uid);
    c.upvotes = Math.max(0, (c.upvotes || 0) - 1);
  } else {
    c.upvotedBy.push(uid);
    c.upvotes = (c.upvotes || 0) + 1;
  }
  writeDB(db);
  res.json({ success: true, upvotes: c.upvotes, upvoted: c.upvotedBy.includes(uid) });
});

// ===================== MAP DATA =====================

app.get("/api/map/complaints", (req, res) => {
  const db = readDB();
  const markers = db.complaints
    .filter((c) => c.latitude && c.longitude)
    .map((c) => ({
      id: c.id, lat: c.latitude, lng: c.longitude,
      description: c.description, address: c.address, severity: c.severity,
      status: c.status, upvotes: c.upvotes || 0, createdAt: c.createdAt,
    }));
  res.json({ success: true, markers });
});

// ===================== FEEDBACK =====================

app.post("/api/feedback", (req, res) => {
  const { userId, userName, rating, comment } = req.body;
  if (!rating || !comment) return res.status(400).json({ success: false, message: "Rating and comment required" });
  const db = readDB();
  const fb = { id: nextId(db.feedback), userId: parseInt(userId) || 0, userName: userName || "Anonymous", rating: parseInt(rating), comment, createdAt: new Date().toISOString() };
  db.feedback.push(fb);
  writeDB(db);
  res.json({ success: true, message: "Feedback Submitted", feedback: fb });
});

app.get("/api/feedback", (req, res) => {
  const db = readDB();
  res.json({ success: true, feedback: db.feedback });
});

// ===================== WORK HISTORY =====================

app.get("/api/work-history", (req, res) => {
  const db = readDB();
  res.json({ success: true, workHistory: db.workHistory });
});

// ===================== NOTES =====================

app.post("/api/notes", (req, res) => {
  const { userId, userName, title, content } = req.body;
  if (!title || !content) return res.status(400).json({ success: false, message: "Title and content required" });
  const db = readDB();
  const note = { id: nextId(db.notes), userId: parseInt(userId) || 0, userName: userName || "Anonymous", title, content, createdAt: new Date().toISOString() };
  db.notes.push(note);
  writeDB(db);
  res.json({ success: true, message: "Note Added", note });
});

app.get("/api/notes", (req, res) => { res.json({ success: true, notes: readDB().notes }); });

app.delete("/api/note/:id", (req, res) => {
  const db = readDB();
  const idx = db.notes.findIndex((n) => n.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ success: false, message: "Not found" });
  db.notes.splice(idx, 1);
  writeDB(db);
  res.json({ success: true, message: "Note Deleted" });
});

// ===================== NOTIFICATIONS =====================

app.get("/api/notifications/:userId", (req, res) => {
  const db = readDB();
  const notifs = (db.notifications || []).filter((n) => n.userId === parseInt(req.params.userId)).reverse();
  res.json({ success: true, notifications: notifs, unread: notifs.filter((n) => !n.read).length });
});

app.put("/api/notifications/:userId/read", (req, res) => {
  const db = readDB();
  (db.notifications || []).forEach((n) => { if (n.userId === parseInt(req.params.userId)) n.read = true; });
  writeDB(db);
  res.json({ success: true });
});

// ===================== EMERGENCY =====================

app.get("/api/emergency-contacts", (req, res) => {
  res.json({
    success: true,
    contacts: [
      { name: "Road Emergency", number: "1073", icon: "road" },
      { name: "Police", number: "100", icon: "shield" },
      { name: "Ambulance", number: "108", icon: "ambulance" },
      { name: "Fire Brigade", number: "101", icon: "fire" },
      { name: "Municipal Corporation", number: "1800-425-0101", icon: "building" },
      { name: "Traffic Helpline", number: "103", icon: "traffic" },
    ],
  });
});

// ===================== SERVE =====================

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../frontend/index.html")));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
