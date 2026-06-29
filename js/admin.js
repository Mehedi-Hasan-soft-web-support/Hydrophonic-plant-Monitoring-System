async function initAdmin() {
  const session = await requireAuth();
  if (!session) return;

  $("#logoutBtn")?.addEventListener("click", logout);
  $("#themeBtn")?.addEventListener("click", toggleTheme);
  $("#copyTokenBtn")?.addEventListener("click", copyGeneratedToken);

  await loadAdminStats();
  await loadUsers();
  await loadAllDevices();

  $("#createDeviceForm")?.addEventListener("submit", createDevice);
}

async function loadAdminStats() {
  const [users, devices, alerts] = await Promise.all([
    supabaseClient.from("profiles").select("*", { count: "exact", head: true }),
    supabaseClient.from("devices").select("*", { count: "exact", head: true }),
    supabaseClient.from("alerts").select("*", { count: "exact", head: true })
  ]);

  $("#totalUsers").textContent = users.count ?? 0;
  $("#totalDevices").textContent = devices.count ?? 0;
  $("#totalAlerts").textContent = alerts.count ?? 0;
}

async function loadUsers() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, email, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const table = $("#usersTableBody");
  if (!table) return;

  if (error) {
    table.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`;
    return;
  }

  table.innerHTML = (data || []).map(user => `
    <tr>
      <td>${user.full_name || "-"}</td>
      <td>${user.email || "-"}</td>
      <td><span class="status-pill">${user.status}</span></td>
      <td>${new Date(user.created_at).toLocaleDateString()}</td>
    </tr>
  `).join("");
}

async function loadAllDevices() {
  const { data, error } = await supabaseClient
    .from("devices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const table = $("#devicesTableBody");
  if (!table) return;

  if (error) {
    table.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
    return;
  }

  table.innerHTML = (data || []).map(device => `
    <tr>
      <td>${device.device_name}</td>
      <td>${device.device_id}</td>
      <td><span class="status-pill">${device.status}</span></td>
      <td>${device.firmware_version || "-"}</td>
      <td>${device.last_online_at ? new Date(device.last_online_at).toLocaleString() : "Never"}</td>
    </tr>
  `).join("");
}

async function createDevice(event) {
  event.preventDefault();

  const deviceId = $("#newDeviceId").value.trim();
  const deviceName = $("#newDeviceName").value.trim();
  const firmwareVersion = $("#newFirmwareVersion")?.value.trim() || "";
  const locationName = $("#newLocationName")?.value.trim() || "";

  if (!deviceId || !deviceName) {
    showToast("Device ID and Device Name are required", "error");
    return;
  }

  const submitBtn = event.target.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating...";
  }

  const { data, error } = await supabaseClient.functions.invoke("create-device", {
    body: {
      device_id: deviceId,
      device_name: deviceName,
      firmware_version: firmwareVersion || null,
      location_name: locationName || null
    }
  });

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create + Generate API Token";
  }

  if (error) {
    console.error("Create device Edge Function error:", error);
    showToast(error.message || "Device creation failed. Check Edge Function Logs.", "error");
    return;
  }

  if (!data?.success) {
    showToast(data?.error || "Device creation failed", "error");
    return;
  }

  const tokenBox = $("#generatedTokenBox");
  const tokenText = $("#generatedTokenText");

  if (tokenBox && tokenText) {
    tokenBox.style.display = "block";
    tokenText.value = data.device_token;
  }

  showToast("Device created. Copy the token now; it will not be shown again.", "success");
  event.target.reset();
  await loadAllDevices();
  await loadAdminStats();
}

async function copyGeneratedToken() {
  const tokenText = $("#generatedTokenText");
  if (!tokenText?.value) return;

  await navigator.clipboard.writeText(tokenText.value);
  showToast("Device token copied", "success");
}

document.addEventListener("DOMContentLoaded", initAdmin);
