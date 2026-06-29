let platformUser = null;
let currentProjectId = null;
let currentDeviceUuid = null;
let currentDevicePublicId = null;
let platformRealtimeChannel = null;
let platformChart = null;
let platformChartLabels = [];
let platformVariables = [];
let platformChartData = {};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function initPlatform() {
  const session = await requireAuth();
  if (!session) return;

  const { data: authData } = await supabaseClient.auth.getUser();
  platformUser = authData.user;

  $("#logoutBtn")?.addEventListener("click", logout);
  $("#themeBtn")?.addEventListener("click", toggleTheme);
  $("#refreshBtn")?.addEventListener("click", refreshPlatformData);
  $("#copyTokenBtn")?.addEventListener("click", copyGeneratedPlatformToken);

  $("#createProjectForm")?.addEventListener("submit", createProject);
  $("#createDeviceForm")?.addEventListener("submit", createPlatformDevice);
  $("#createVariableForm")?.addEventListener("submit", createVariable);

  $("#projectSelect")?.addEventListener("change", async (event) => {
    currentProjectId = event.target.value;
    await loadProjectDevices();
  });

  $("#deviceSelect")?.addEventListener("change", async (event) => {
    setCurrentDeviceFromSelect(event.target);
    await refreshPlatformData();
    subscribePlatformRealtime();
  });

  await loadProjects();
}

async function loadProjects() {
  const select = $("#projectSelect");
  if (!select) return;

  const { data, error } = await supabaseClient
    .from("iot_projects")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message, "error");
    select.innerHTML = `<option value="">Project load failed</option>`;
    return;
  }

  if (!data || data.length === 0) {
    select.innerHTML = `<option value="">No project yet</option>`;
    currentProjectId = null;
    clearDeviceUI();
    return;
  }

  select.innerHTML = "";
  data.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    select.appendChild(option);
  });

  currentProjectId = data[0].id;
  select.value = currentProjectId;
  await loadProjectDevices();
}

async function createProject(event) {
  event.preventDefault();

  if (!platformUser) {
    showToast("Login required", "error");
    return;
  }

  const name = $("#projectName").value.trim();
  const description = $("#projectDescription").value.trim();

  if (!name) {
    showToast("Project name is required", "error");
    return;
  }

  const { data, error } = await supabaseClient
    .from("iot_projects")
    .insert({
      owner_id: platformUser.id,
      name,
      description: description || null,
    })
    .select("id")
    .single();

  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast("Project created", "success");
  event.target.reset();
  await loadProjects();
  if (data?.id) {
    currentProjectId = data.id;
    $("#projectSelect").value = data.id;
    await loadProjectDevices();
  }
}

function clearDeviceUI() {
  const deviceSelect = $("#deviceSelect");
  if (deviceSelect) deviceSelect.innerHTML = `<option value="">No device yet</option>`;
  currentDeviceUuid = null;
  currentDevicePublicId = null;
  platformVariables = [];
  renderVariablesTable([]);
  renderVariableCards({}, []);
  updateSamplePayload();
}

function setCurrentDeviceFromSelect(select) {
  currentDeviceUuid = select.value || null;
  const option = select.options[select.selectedIndex];
  currentDevicePublicId = option?.dataset?.deviceId || null;
}

async function loadProjectDevices() {
  const select = $("#deviceSelect");
  if (!select) return;

  if (!currentProjectId) {
    clearDeviceUI();
    return;
  }

  const { data, error } = await supabaseClient
    .from("devices")
    .select("id, device_id, device_name, status, firmware_version, last_online_at")
    .eq("project_id", currentProjectId)
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message, "error");
    select.innerHTML = `<option value="">Device load failed</option>`;
    return;
  }

  if (!data || data.length === 0) {
    clearDeviceUI();
    return;
  }

  select.innerHTML = "";
  data.forEach((device) => {
    const option = document.createElement("option");
    option.value = device.id;
    option.dataset.deviceId = device.device_id;
    option.textContent = `${device.device_name} (${device.device_id}) - ${device.status}`;
    select.appendChild(option);
  });

  select.value = data[0].id;
  setCurrentDeviceFromSelect(select);
  await refreshPlatformData();
  subscribePlatformRealtime();
}

async function createPlatformDevice(event) {
  event.preventDefault();

  if (!currentProjectId) {
    showToast("Create or select a project first", "error");
    return;
  }

  const device_id = $("#deviceId").value.trim();
  const device_name = $("#deviceName").value.trim();
  const firmware_version = $("#firmwareVersion").value.trim();
  const location_name = $("#locationName").value.trim();

  if (!device_id || !device_name) {
    showToast("Device ID and name are required", "error");
    return;
  }

  const submitBtn = event.target.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  submitBtn.textContent = "Creating...";

  const { data, error } = await supabaseClient.functions.invoke("create-platform-device", {
    body: {
      project_id: currentProjectId,
      device_id,
      device_name,
      firmware_version: firmware_version || null,
      location_name: location_name || null,
    },
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Create Device + Token";

  if (error) {
    console.error(error);
    showToast(error.message || "Device create failed. Check Edge Function logs.", "error");
    return;
  }

  if (!data?.success) {
    showToast(data?.error || "Device create failed", "error");
    return;
  }

  $("#tokenBox").style.display = "block";
  $("#generatedToken").value = data.device_token;

  showToast("Device created. Copy the token now.", "success");
  event.target.reset();
  await loadProjectDevices();
}

async function copyGeneratedPlatformToken() {
  const token = $("#generatedToken")?.value;
  if (!token) return;
  await navigator.clipboard.writeText(token);
  showToast("Device token copied", "success");
}

function normalizeVariableKey(key) {
  return key.trim().replace(/\s+/g, "_");
}

async function createVariable(event) {
  event.preventDefault();

  if (!currentProjectId || !currentDeviceUuid) {
    showToast("Select a project and device first", "error");
    return;
  }

  const variable_key = normalizeVariableKey($("#variableKey").value);
  const display_name = $("#variableName").value.trim();
  const data_type = $("#variableType").value;
  const unit = $("#variableUnit").value.trim();
  const warning_min_raw = $("#warningMin").value;
  const warning_max_raw = $("#warningMax").value;

  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(variable_key)) {
    showToast("Variable key must start with a letter and use only letters, numbers, underscore. Max 40 chars.", "error");
    return;
  }

  if (!display_name) {
    showToast("Display name is required", "error");
    return;
  }

  const { error } = await supabaseClient
    .from("device_variables")
    .insert({
      project_id: currentProjectId,
      device_id: currentDeviceUuid,
      variable_key,
      display_name,
      data_type,
      unit: unit || null,
      warning_min: warning_min_raw === "" ? null : Number(warning_min_raw),
      warning_max: warning_max_raw === "" ? null : Number(warning_max_raw),
    });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast("Variable created", "success");
  event.target.reset();
  await refreshPlatformData();
}

async function refreshPlatformData() {
  if (!currentDeviceUuid) {
    renderVariablesTable([]);
    renderVariableCards({}, []);
    updateSamplePayload();
    return;
  }

  await loadVariables();
  await loadLatestVariableReadings();
  await loadChartHistory();
  updateSamplePayload();
}

async function loadVariables() {
  const { data, error } = await supabaseClient
    .from("device_variables")
    .select("*")
    .eq("device_id", currentDeviceUuid)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    showToast(error.message, "error");
    platformVariables = [];
  } else {
    platformVariables = data || [];
  }

  renderVariablesTable(platformVariables);
}

function renderVariablesTable(variables) {
  const body = $("#variablesTableBody");
  if (!body) return;

  if (!variables || variables.length === 0) {
    body.innerHTML = `<tr><td colspan="5">No variables yet. Create one from the left panel.</td></tr>`;
    return;
  }

  body.innerHTML = variables.map((v) => `
    <tr>
      <td><code>${escapeHtml(v.variable_key)}</code></td>
      <td>${escapeHtml(v.display_name)}</td>
      <td>${escapeHtml(v.data_type)}</td>
      <td>${escapeHtml(v.unit || "-")}</td>
      <td><span class="status-pill">${v.enabled ? "enabled" : "disabled"}</span></td>
    </tr>
  `).join("");
}

async function loadLatestVariableReadings() {
  if (!currentDeviceUuid || platformVariables.length === 0) {
    renderVariableCards({}, platformVariables);
    return;
  }

  const { data, error } = await supabaseClient
    .from("variable_readings")
    .select("variable_key, numeric_value, text_value, bool_value, recorded_at")
    .eq("device_id", currentDeviceUuid)
    .order("recorded_at", { ascending: false })
    .limit(500);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  const latest = {};
  for (const row of data || []) {
    if (!latest[row.variable_key]) latest[row.variable_key] = row;
  }

  renderVariableCards(latest, platformVariables);
}

function getReadingDisplay(variable, reading) {
  if (!reading) return "--";
  if (variable.data_type === "number") {
    const value = reading.numeric_value;
    if (value === null || value === undefined) return "--";
    return `${Number(value).toFixed(2)}${variable.unit ? " " + variable.unit : ""}`;
  }
  if (variable.data_type === "boolean") {
    return reading.bool_value === true ? "True" : reading.bool_value === false ? "False" : "--";
  }
  return reading.text_value || "--";
}

function isWarning(variable, reading) {
  if (!reading || variable.data_type !== "number") return false;
  const value = Number(reading.numeric_value);
  if (!Number.isFinite(value)) return false;
  if (variable.warning_min !== null && variable.warning_min !== undefined && value < Number(variable.warning_min)) return true;
  if (variable.warning_max !== null && variable.warning_max !== undefined && value > Number(variable.warning_max)) return true;
  return false;
}

function renderVariableCards(latest, variables) {
  const cards = $("#variableCards");
  if (!cards) return;

  if (!variables || variables.length === 0) {
    cards.innerHTML = `<div class="empty">No variables yet. Create variables to build your dashboard.</div>`;
    return;
  }

  cards.innerHTML = variables.map((v) => {
    const reading = latest[v.variable_key];
    const warning = isWarning(v, reading);
    return `
      <div class="sensor-card variable-card" style="border-color:${warning ? 'rgba(255,204,102,0.75)' : 'var(--border)'}">
        <h3>${escapeHtml(v.display_name)}</h3>
        <div class="sensor-value">${escapeHtml(getReadingDisplay(v, reading))}</div>
        <div class="variable-meta">
          <span class="badge">${escapeHtml(v.variable_key)}</span>
          <span class="badge">${escapeHtml(v.data_type)}</span>
          ${warning ? '<span class="badge" style="color:var(--warning)">Warning</span>' : ''}
        </div>
        <small>${reading?.recorded_at ? new Date(reading.recorded_at).toLocaleString() : 'No data yet'}</small>
      </div>
    `;
  }).join("");
}

function initPlatformChart() {
  const ctx = document.getElementById("platformChart");
  if (!ctx) return;

  platformChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: platformChartLabels,
      datasets: [],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: getComputedStyle(document.body).getPropertyValue("--text") } } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.body).getPropertyValue("--muted") } },
        y: { ticks: { color: getComputedStyle(document.body).getPropertyValue("--muted") } },
      },
    },
  });
}

async function loadChartHistory() {
  if (!currentDeviceUuid || platformVariables.length === 0) {
    updateChart([], {});
    return;
  }

  const numericVariables = platformVariables.filter((v) => v.data_type === "number" && v.chart_enabled);
  if (numericVariables.length === 0) {
    updateChart([], {});
    return;
  }

  const numericKeys = numericVariables.map((v) => v.variable_key);

  const { data, error } = await supabaseClient
    .from("variable_readings")
    .select("variable_key, numeric_value, recorded_at")
    .eq("device_id", currentDeviceUuid)
    .in("variable_key", numericKeys)
    .order("recorded_at", { ascending: false })
    .limit(240);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  const ordered = (data || []).reverse();
  const labels = [...new Set(ordered.map((row) => new Date(row.recorded_at).toLocaleTimeString()))].slice(-40);
  const series = {};

  numericVariables.forEach((v) => {
    series[v.variable_key] = [];
  });

  labels.forEach((label) => {
    numericVariables.forEach((v) => {
      const row = ordered.find((r) => r.variable_key === v.variable_key && new Date(r.recorded_at).toLocaleTimeString() === label);
      series[v.variable_key].push(row ? Number(row.numeric_value || 0) : null);
    });
  });

  updateChart(labels, series);
}

function updateChart(labels, series) {
  platformChartLabels = labels || [];
  platformChartData = series || {};

  if (!platformChart) initPlatformChart();
  if (!platformChart) return;

  const numericVariables = platformVariables.filter((v) => v.data_type === "number" && v.chart_enabled);

  platformChart.data.labels = platformChartLabels;
  platformChart.data.datasets = numericVariables.map((v) => ({
    label: `${v.display_name}${v.unit ? ' (' + v.unit + ')' : ''}`,
    data: platformChartData[v.variable_key] || [],
    tension: 0.35,
  }));

  platformChart.update();
}

function addRealtimeReading(row) {
  const variable = platformVariables.find((v) => v.variable_key === row.variable_key);
  if (!variable) return;

  loadLatestVariableReadings();

  if (variable.data_type !== "number" || !platformChart) return;

  const label = new Date(row.recorded_at).toLocaleTimeString();
  if (!platformChartLabels.includes(label)) platformChartLabels.push(label);
  if (platformChartLabels.length > 40) platformChartLabels.shift();

  if (!platformChartData[row.variable_key]) platformChartData[row.variable_key] = [];
  platformChartData[row.variable_key].push(Number(row.numeric_value || 0));
  if (platformChartData[row.variable_key].length > 40) platformChartData[row.variable_key].shift();

  updateChart(platformChartLabels, platformChartData);
}

function subscribePlatformRealtime() {
  if (!currentDeviceUuid) return;

  if (platformRealtimeChannel) {
    supabaseClient.removeChannel(platformRealtimeChannel);
  }

  platformRealtimeChannel = supabaseClient
    .channel(`platform-variable-readings-${currentDeviceUuid}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "variable_readings",
        filter: `device_id=eq.${currentDeviceUuid}`,
      },
      (payload) => {
        addRealtimeReading(payload.new);
      }
    )
    .subscribe();
}

function updateSamplePayload() {
  const sample = $("#samplePayload");
  if (!sample) return;

  const endpoint = `${window.APP_CONFIG?.SUPABASE_URL || "https://YOUR_PROJECT_REF.supabase.co"}/functions/v1/ingest-generic-reading`;
  const deviceId = currentDevicePublicId || "your_device_id";

  const values = {};
  (platformVariables || []).forEach((v) => {
    if (v.data_type === "number") values[v.variable_key] = 25.5;
    else if (v.data_type === "boolean") values[v.variable_key] = true;
    else values[v.variable_key] = "OK";
  });

  if (Object.keys(values).length === 0) {
    values.water_temp = 25.5;
    values.tds = 650;
  }

  sample.textContent = `POST ${endpoint}\nHeaders:\n  Content-Type: application/json\n  x-device-id: ${deviceId}\n  x-device-token: YOUR_DEVICE_TOKEN\n\nBody:\n${JSON.stringify({
    device_id: deviceId,
    firmware_version: "1.0.0",
    rssi: -55,
    battery_voltage: 4.1,
    values,
  }, null, 2)}`;
}

document.addEventListener("DOMContentLoaded", initPlatform);
