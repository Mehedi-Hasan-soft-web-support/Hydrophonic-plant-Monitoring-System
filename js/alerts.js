async function initAlerts() {
  const session = await requireAuth();
  if (!session) return;

  $("#logoutBtn")?.addEventListener("click", logout);
  $("#themeBtn")?.addEventListener("click", toggleTheme);

  await loadAlerts();

  supabaseClient
    .channel("alerts-channel")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "alerts"
      },
      () => {
        loadAlerts();
        showToast("New alert received", "warning");
      }
    )
    .subscribe();
}

async function loadAlerts() {
  const { data, error } = await supabaseClient
    .from("alerts")
    .select("*, devices(device_name, device_id)")
    .order("created_at", { ascending: false })
    .limit(100);

  const list = $("#alertsList");

  if (error) {
    list.innerHTML = `<div class="empty">${error.message}</div>`;
    return;
  }

  if (!data.length) {
    list.innerHTML = `<div class="empty">No alerts found.</div>`;
    return;
  }

  list.innerHTML = data.map(alert => `
    <div class="alert-item ${alert.severity}">
      <div>
        <h3>${alert.title}</h3>
        <p>${alert.message}</p>
        <small>${alert.devices?.device_name || "Device"} • ${new Date(alert.created_at).toLocaleString()}</small>
      </div>
      <span class="status-pill">${alert.severity}</span>
    </div>
  `).join("");
}

document.addEventListener("DOMContentLoaded", initAlerts);
 
