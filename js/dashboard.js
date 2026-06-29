let currentDeviceId = null;
let realtimeChannel = null;
let chart = null;
let chartLabels = [];
let chartSeries = {
  water_temperature: [],
  tds: [],
  turbidity: []
};

async function initDashboard() {
  const session = await requireAuth();
  if (!session) return;

  $("#logoutBtn")?.addEventListener("click", logout);
  $("#themeBtn")?.addEventListener("click", toggleTheme);

  await loadUserProfile();
  await loadDevices();

  $("#deviceSelect")?.addEventListener("change", async (event) => {
    currentDeviceId = event.target.value;
    await loadLatestReading();
    await loadHistoricalReadings();
    subscribeToReadings();
  });
}

async function loadUserProfile() {
  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData.user;

  if (!user) return;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  $("#userName").textContent = profile?.full_name || user.email;
  $("#userEmail").textContent = user.email;

  if (profile?.avatar_url) {
    $("#avatar").src = profile.avatar_url;
  }
}

async function loadDevices() {
  const { data, error } = await supabaseClient
    .from("devices")
    .select("id, device_id, device_name, status, last_online_at, firmware_version, location_name")
    .order("created_at", { ascending: false });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  const select = $("#deviceSelect");
  select.innerHTML = "";

  data.forEach(device => {
    const option = document.createElement("option");
    option.value = device.id;
    option.textContent = `${device.device_name} (${device.device_id})`;
    select.appendChild(option);
  });

  if (data.length > 0) {
    currentDeviceId = data[0].id;
    select.value = currentDeviceId;
    await loadLatestReading();
    await loadHistoricalReadings();
    subscribeToReadings();
  } else {
    showToast("No device assigned yet.", "info");
  }
}

function updateSensorCards(reading) {
  $("#waterTempValue").textContent = formatValue(reading.water_temperature, "°C", 1);
  $("#airTempValue").textContent = formatValue(reading.air_temperature, "°C", 1);
  $("#humidityValue").textContent = formatValue(reading.humidity, "%", 1);
  $("#tdsValue").textContent = formatValue(reading.tds, " ppm", 0);
  $("#turbidityValue").textContent = formatValue(reading.turbidity, " NTU", 0);
  $("#batteryValue").textContent = formatValue(reading.battery_voltage, " V", 2);
  $("#rssiValue").textContent = reading.rssi ?? "--";
  $("#lastUpdate").textContent = reading.recorded_at ? new Date(reading.recorded_at).toLocaleString() : "--";
}

async function loadLatestReading() {
  if (!currentDeviceId) return;

  const { data, error } = await supabaseClient
    .from("sensor_readings")
    .select("*")
    .eq("device_id", currentDeviceId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    showToast(error.message, "error");
    return;
  }

  if (data) {
    updateSensorCards(data);
  }
}

function initChart() {
  const ctx = document.getElementById("liveChart");
  if (!ctx) return;

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: "Water Temp °C",
          data: chartSeries.water_temperature,
          tension: 0.35
        },
        {
          label: "TDS ppm",
          data: chartSeries.tds,
          tension: 0.35
        },
        {
          label: "Turbidity NTU",
          data: chartSeries.turbidity,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: getComputedStyle(document.body).getPropertyValue("--text")
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue("--muted")
          }
        },
        y: {
          ticks: {
            color: getComputedStyle(document.body).getPropertyValue("--muted")
          }
        }
      }
    }
  });
}

async function loadHistoricalReadings() {
  if (!currentDeviceId) return;

  const { data, error } = await supabaseClient
    .from("sensor_readings")
    .select("recorded_at, water_temperature, tds, turbidity")
    .eq("device_id", currentDeviceId)
    .order("recorded_at", { ascending: false })
    .limit(30);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  const ordered = data.reverse();

  chartLabels = ordered.map(row => new Date(row.recorded_at).toLocaleTimeString());
  chartSeries.water_temperature = ordered.map(row => Number(row.water_temperature || 0));
  chartSeries.tds = ordered.map(row => Number(row.tds || 0));
  chartSeries.turbidity = ordered.map(row => Number(row.turbidity || 0));

  if (!chart) initChart();
  else {
    chart.data.labels = chartLabels;
    chart.data.datasets[0].data = chartSeries.water_temperature;
    chart.data.datasets[1].data = chartSeries.tds;
    chart.data.datasets[2].data = chartSeries.turbidity;
    chart.update();
  }
}

function addReadingToChart(reading) {
  if (!chart) return;

  chartLabels.push(new Date(reading.recorded_at).toLocaleTimeString());
  chartSeries.water_temperature.push(Number(reading.water_temperature || 0));
  chartSeries.tds.push(Number(reading.tds || 0));
  chartSeries.turbidity.push(Number(reading.turbidity || 0));

  if (chartLabels.length > 30) {
    chartLabels.shift();
    chartSeries.water_temperature.shift();
    chartSeries.tds.shift();
    chartSeries.turbidity.shift();
  }

  chart.data.labels = chartLabels;
  chart.data.datasets[0].data = chartSeries.water_temperature;
  chart.data.datasets[1].data = chartSeries.tds;
  chart.data.datasets[2].data = chartSeries.turbidity;
  chart.update();
}

function subscribeToReadings() {
  if (!currentDeviceId) return;

  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel("sensor-readings-channel")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "sensor_readings",
        filter: `device_id=eq.${currentDeviceId}`
      },
      (payload) => {
        updateSensorCards(payload.new);
        addReadingToChart(payload.new);
        showToast("New sensor reading received", "success");
      }
    )
    .subscribe();
}

async function exportCsv() {
  if (!currentDeviceId) return;

  const { data, error } = await supabaseClient
    .from("sensor_readings")
    .select("*")
    .eq("device_id", currentDeviceId)
    .order("recorded_at", { ascending: false })
    .limit(1000);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  const headers = Object.keys(data[0] || {});
  const rows = data.map(row => headers.map(header => JSON.stringify(row[header] ?? "")).join(","));
  const csv = [headers.join(","), ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "sensor-readings.csv";
  link.click();
}

document.addEventListener("DOMContentLoaded", initDashboard);
