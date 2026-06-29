async function initProfile() {
  const session = await requireAuth();
  if (!session) return;

  $("#logoutBtn")?.addEventListener("click", logout);
  $("#themeBtn")?.addEventListener("click", toggleTheme);

  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData.user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  $("#profileEmail").value = user.email || "";
  $("#profileName").value = profile?.full_name || "";
  $("#profilePhone").value = profile?.phone || "";

  $("#profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const { error } = await supabaseClient
      .from("profiles")
      .update({
        full_name: $("#profileName").value.trim(),
        phone: $("#profilePhone").value.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id);

    if (error) {
      showToast(error.message, "error");
      return;
    }

    showToast("Profile updated", "success");
  });
}

document.addEventListener("DOMContentLoaded", initProfile);
