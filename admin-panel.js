let adminRoot = null;
let adminSupabase = null;
let adminUser = null;
let adminData = { profiles: [], documents: [], activity: [] };
let adminTab = "documents";

const el = (tag, textValue, className) => {
  const node = document.createElement(tag);
  if (textValue !== undefined) node.textContent = textValue;
  if (className) node.className = className;
  return node;
};
const actionButton = (label, className, handler) => {
  const button = el("button", label, className);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
};

export async function initAdminPanel(supabase, user) {
  resetAdminPanel();
  adminSupabase = supabase;
  adminUser = user;
  const { data, error } = await supabase.rpc("is_app_admin");
  if (error) {
    console.warn("StudyDrop admin role check:", error.message);
    return;
  }
  if (data !== true) return;

  const accountBar = document.querySelector(".account-bar");
  const mainPanel = document.querySelector(".main-panel");
  if (!accountBar || !mainPanel) return;

  const openButton = actionButton("Admin Control", "admin-open-button", () => toggleAdminPanel(true));
  openButton.id = "adminPanelBtn";
  accountBar.prepend(openButton);

  adminRoot = el("section", undefined, "admin-panel");
  adminRoot.id = "adminPanel";
  adminRoot.hidden = true;
  adminRoot.innerHTML = `
    <div class="admin-heading">
      <div><p class="eyebrow">OWNER WORKSPACE</p><h2>Admin Control Panel</h2><p>Manage registered users, their documents, recycle bin and activity.</p></div>
      <button type="button" class="admin-close-button" id="adminBackBtn">Back to StudyDrop</button>
    </div>
    <div class="admin-summary" id="adminSummary"></div>
    <nav class="admin-tabs" aria-label="Admin sections">
      <button type="button" data-admin-tab="documents" class="active">All documents</button>
      <button type="button" data-admin-tab="users">Users</button>
      <button type="button" data-admin-tab="trash">Recycle bin</button>
      <button type="button" data-admin-tab="activity">Activity history</button>
    </nav>
    <label class="admin-search">Search admin data <input id="adminSearch" type="search" placeholder="Search users, documents, subjects…"></label>
    <div id="adminContent" class="admin-content"><p>Loading admin data…</p></div>
    <dialog id="adminEditDialog" class="admin-edit-dialog">
      <form id="adminEditForm" method="dialog">
        <h3>Edit document details</h3>
        <label>Document name<input name="name" maxlength="255" required></label>
        <label>Student name<input name="student" maxlength="150"></label>
        <label>Subject<input name="subject" maxlength="150"></label>
        <label>Category<select name="category"><option value="assignment">Assignment</option><option value="notes">Notes</option><option value="project">Project</option><option value="media">Media</option></select></label>
        <label>Tags (comma separated)<input name="tags" maxlength="500"></label>
        <label>Note<textarea name="note" rows="3" maxlength="2000"></textarea></label>
        <div class="admin-dialog-actions"><button type="button" id="adminCancelEdit">Cancel</button><button type="submit" class="admin-save-button">Save changes</button></div>
      </form>
    </dialog>`;
  const topbar = mainPanel.querySelector(".topbar");
  topbar.insertAdjacentElement("afterend", adminRoot);

  adminRoot.querySelector("#adminBackBtn").addEventListener("click", () => toggleAdminPanel(false));
  adminRoot.querySelectorAll("[data-admin-tab]").forEach(button => {
    button.addEventListener("click", () => {
      adminTab = button.dataset.adminTab;
      adminRoot.querySelectorAll("[data-admin-tab]").forEach(item => item.classList.toggle("active", item === button));
      renderAdminContent();
    });
  });
  adminRoot.querySelector("#adminSearch").addEventListener("input", renderAdminContent);
  adminRoot.querySelector("#adminCancelEdit").addEventListener("click", () => adminRoot.querySelector("#adminEditDialog").close());
  adminRoot.querySelector("#adminEditForm").addEventListener("submit", saveDocumentEdit);
  await refreshAdminData();
}

function toggleAdminPanel(open) {
  if (!adminRoot) return;
  adminRoot.hidden = !open;
  for (const selector of [".dashboard-overview", ".upload-grid", ".queue-panel"]) {
    const section = document.querySelector(selector);
    if (section) section.hidden = open;
  }
  if (open) refreshAdminData();
}

async function refreshAdminData() {
  if (!adminSupabase || !adminRoot) return;
  const [profilesResult, docsResult, activityResult] = await Promise.all([
    adminSupabase.from("profiles").select("id,email,full_name,created_at").order("created_at", { ascending: false }),
    adminSupabase.from("documents").select("*").order("created_at", { ascending: false }),
    adminSupabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(250)
  ]);
  const failure = profilesResult.error || docsResult.error || activityResult.error;
  if (failure) {
    const content = adminRoot.querySelector("#adminContent");
    content.replaceChildren(el("p", "Admin data could not be loaded: " + failure.message, "admin-error"));
    return;
  }
  adminData = { profiles: profilesResult.data || [], documents: docsResult.data || [], activity: activityResult.data || [] };
  const summary = adminRoot.querySelector("#adminSummary");
  summary.replaceChildren(
    summaryCard("Registered users", adminData.profiles.length),
    summaryCard("All documents", adminData.documents.filter(d => !d.deleted_at).length),
    summaryCard("In recycle bin", adminData.documents.filter(d => !!d.deleted_at).length),
    summaryCard("Activity events", adminData.activity.length)
  );
  renderAdminContent();
}
function summaryCard(label, value) {
  const card = el("article", undefined, "admin-summary-card");
  card.append(el("span", label), el("strong", String(value)));
  return card;
}
function makeTable(headers) {
  const table = el("table", undefined, "admin-table");
  const thead = document.createElement("thead"), row = document.createElement("tr");
  headers.forEach(header => row.append(el("th", header)));
  thead.append(row); table.append(thead);
  table.append(document.createElement("tbody"));
  return table;
}
function addEmptyRow(table, message, span) {
  const row = document.createElement("tr"), cell = el("td", message);
  cell.colSpan = span; row.append(cell); table.querySelector("tbody").append(row);
}
function renderAdminContent() {
  if (!adminRoot) return;
  const host = adminRoot.querySelector("#adminContent");
  host.replaceChildren();
  const query = adminRoot.querySelector("#adminSearch").value.trim().toLowerCase();
  if (adminTab === "users") return renderUsers(host, query);
  if (adminTab === "activity") return renderActivity(host, query);
  renderDocuments(host, query, adminTab === "trash");
}
function renderDocuments(host, query, trashOnly) {
  const profiles = new Map(adminData.profiles.map(profile => [profile.id, profile]));
  const table = makeTable(["Document", "Owner", "Student / Subject", "Size", "Uploaded", "Actions"]);
  const docs = adminData.documents.filter(doc => (!!doc.deleted_at) === trashOnly).filter(doc => {
    const owner = profiles.get(doc.user_id);
    return [doc.name, doc.student, doc.subject, doc.category, owner?.email, owner?.full_name, ...(doc.tags || [])].join(" ").toLowerCase().includes(query);
  });
  if (!docs.length) addEmptyRow(table, trashOnly ? "Recycle bin is empty." : "No documents match your search.", 6);
  docs.forEach(doc => {
    const owner = profiles.get(doc.user_id);
    const row = document.createElement("tr");
    row.append(el("td", doc.name), el("td", owner?.email || "Unknown user"), el("td", (doc.student || "—") + " / " + (doc.subject || "—")), el("td", formatAdminBytes(doc.size)), el("td", new Date(doc.created_at).toLocaleString()));
    const actions = el("td", undefined, "admin-row-actions");
    actions.append(actionButton("Open file", "admin-edit-button", () => openDocumentFile(doc)));
    actions.append(actionButton("Edit", "admin-edit-button", () => openDocumentEdit(doc)));
    if (trashOnly) {
      actions.append(actionButton("Restore", "admin-restore-button", () => restoreDocument(doc)));
    } else {
      actions.append(actionButton("Move to bin", "admin-trash-button", () => softDeleteDocument(doc)));
    }
    row.append(actions); table.querySelector("tbody").append(row);
  });
  host.append(table);
}
function renderUsers(host, query) {
  const table = makeTable(["Name", "Email", "Joined", "Documents", "Action"]);
  const users = adminData.profiles.filter(profile => [profile.full_name, profile.email].join(" ").toLowerCase().includes(query));
  if (!users.length) addEmptyRow(table, "No users match your search.", 5);
  users.forEach(profile => {
    const count = adminData.documents.filter(doc => doc.user_id === profile.id && !doc.deleted_at).length;
    const row = document.createElement("tr");
    row.append(el("td", profile.full_name || "—"), el("td", profile.email), el("td", new Date(profile.created_at).toLocaleDateString()), el("td", String(count)));
    const actions = el("td");
    actions.append(actionButton("Edit name", "admin-edit-button", async () => {
      const nextName = prompt("Update display name for " + profile.email, profile.full_name || "");
      if (nextName === null) return;
      const { error } = await adminSupabase.from("profiles").update({ full_name: nextName.trim() }).eq("id", profile.id);
      if (error) alert("Could not update profile: " + error.message);
      else await refreshAdminData();
    }));
    row.append(actions); table.querySelector("tbody").append(row);
  });
  host.append(table);
}
function renderActivity(host, query) {
  const profiles = new Map(adminData.profiles.map(profile => [profile.id, profile]));
  const table = makeTable(["Time", "Action", "Document", "Document owner", "Performed by"]);
  const entries = adminData.activity.filter(item => {
    const owner = profiles.get(item.user_id), actor = profiles.get(item.actor_id);
    return [item.action, item.details?.name, owner?.email, actor?.email].join(" ").toLowerCase().includes(query);
  });
  if (!entries.length) addEmptyRow(table, "No activity records found.", 5);
  entries.forEach(item => {
    const row = document.createElement("tr");
    row.append(el("td", new Date(item.created_at).toLocaleString()), el("td", item.action), el("td", item.details?.name || "—"), el("td", profiles.get(item.user_id)?.email || "—"), el("td", profiles.get(item.actor_id)?.email || "System"));
    table.querySelector("tbody").append(row);
  });
  host.append(table);
}
async function openDocumentFile(doc) {\n  const popup = window.open("about:blank", "_blank");\n  if (!popup) { alert("Allow pop-ups for StudyDrop to open this private document."); return; }\n  const { data, error } = await adminSupabase.storage.from("documents").createSignedUrl(doc.storage_path, 300, { download: doc.name });\n  if (error) { popup.close(); alert("Could not open file: " + error.message); return; }\n  popup.location.href = data.signedUrl;\n}\nfunction openDocumentEdit(doc) {
  const dialog = adminRoot.querySelector("#adminEditDialog");
  const form = adminRoot.querySelector("#adminEditForm");
  form.elements.name.value = doc.name || "";
  form.elements.student.value = doc.student || "";
  form.elements.subject.value = doc.subject || "";
  form.elements.category.value = doc.category || "notes";
  form.elements.tags.value = (doc.tags || []).join(", ");
  form.elements.note.value = doc.note || "";
  form.dataset.documentId = doc.id;
  dialog.showModal();
}
async function saveDocumentEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    name: form.elements.name.value.trim(),
    student: form.elements.student.value.trim() || "Student",
    subject: form.elements.subject.value.trim() || "General",
    category: form.elements.category.value,
    tags: form.elements.tags.value.split(",").map(tag => tag.trim()).filter(Boolean),
    note: form.elements.note.value.trim()
  };
  if (!payload.name) return;
  const { error } = await adminSupabase.from("documents").update(payload).eq("id", form.dataset.documentId);
  if (error) alert("Could not update document: " + error.message);
  else {
    adminRoot.querySelector("#adminEditDialog").close();
    await refreshAdminData();
  }
}
async function softDeleteDocument(doc) {
  if (!confirm("Move “" + doc.name + "” to the recycle bin? The cloud file will be kept and can be restored.")) return;
  const { error } = await adminSupabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", doc.id);
  if (error) alert("Could not move document: " + error.message);
  else await refreshAdminData();
}
async function restoreDocument(doc) {
  const { error } = await adminSupabase.from("documents").update({ deleted_at: null }).eq("id", doc.id);
  if (error) alert("Could not restore document: " + error.message);
  else await refreshAdminData();
}
function formatAdminBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}
export function resetAdminPanel() {
  document.querySelector("#adminPanelBtn")?.remove();
  document.querySelector("#adminPanel")?.remove();
  for (const selector of [".dashboard-overview", ".upload-grid", ".queue-panel"]) {
    const section = document.querySelector(selector);
    if (section) section.hidden = false;
  }
  adminRoot = null;
  adminSupabase = null;
  adminUser = null;
  adminData = { profiles: [], documents: [], activity: [] };
  adminTab = "documents";
}
