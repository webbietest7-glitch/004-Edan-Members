(() => {
  "use strict";

  const SUPABASE_URL = "https://tqgjgnohqzmvkakqxhcm.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_R6DbjHgjZXrJSwVKLKvh0Q_Ks0BFYEV";

  // Card grid (browse view)
  const typeList   = document.getElementById("appointmentTypeList");
  // Booking form elements
  const form       = document.getElementById("appointmentForm");
  const radioList  = document.getElementById("appointmentTypeList2");
  const dateSelect = document.getElementById("appointmentDate");
  const slotList   = document.getElementById("appointmentSlotList");
  const slotInput  = document.getElementById("appointmentSlot");
  const nameInput  = document.getElementById("appointmentName");
  const emailInput = document.getElementById("appointmentEmail");
  const whatsInput = document.getElementById("appointmentWhatsapp");
  const noteInput  = document.getElementById("appointmentNote");
  const reviewEl   = document.getElementById("appointmentReview");
  const statusEl   = document.getElementById("appointmentStatus");
  const submitBtn  = document.getElementById("appointmentSubmit");
  // Navigation
  const backBtn    = document.getElementById("apptBack");
  const nextBtn    = document.getElementById("apptNext");
  // Steps
  const stepEls    = document.querySelectorAll(".members__appt-step");
  const fieldsets  = [
    document.getElementById("apptStepType"),
    document.getElementById("apptStepDate"),
    document.getElementById("apptStepTime"),
    document.getElementById("apptStepDetails"),
    document.getElementById("apptStepReview"),
  ];
  // Upcoming + confirmation
  const list           = document.getElementById("appointmentList");
  const confirmation   = document.getElementById("appointmentConfirmation");
  const confirmDetails = document.getElementById("appointmentConfirmationDetails");

  if (!form) return;

  let client, currentUser;
  let types  = [];
  let slots  = [];
  let step   = 0; // 0–4

  const PHOTOS = [...document.querySelectorAll("#appointmentTypePhotos [data-photo]")]
    .map((el) => el.dataset.photo);

  const dateFormat     = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
  const timeFormat     = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  function setStatus(text) { statusEl.textContent = text; }

  function formatDuration() {
    return "Duration: TBD";
  }

  // ── Step navigation ──────────────────────────────────────────────────────

  function goToStep(n) {
    step = Math.max(0, Math.min(4, n));
    fieldsets.forEach((fs, i) => { if (fs) fs.hidden = i !== step; });
    stepEls.forEach((el, i) => {
      el.classList.toggle("is-active", i === step);
      el.classList.toggle("is-done",   i < step);
    });
    backBtn.hidden   = step === 0;
    nextBtn.hidden   = step === 4;
    submitBtn.hidden = step !== 4;
    if (step === 4) updateReview();
    statusEl.textContent = "";
  }

  function canAdvance() {
    if (step === 0) return !!radioList?.querySelector("input[type=radio]:checked");
    if (step === 1) return !!dateSelect?.value;
    if (step === 2) return !!slotInput?.value;
    if (step === 3) return !!(nameInput?.value.trim() && emailInput?.value.trim());
    return false;
  }

  nextBtn?.addEventListener("click", () => {
    if (!canAdvance()) {
      setStatus("Please complete this step before continuing.");
      return;
    }
    goToStep(step + 1);
  });

  backBtn?.addEventListener("click", () => goToStep(step - 1));

  // ── Type cards (browse section) ──────────────────────────────────────────

  function renderTypeCards() {
    if (!typeList) return;
    typeList.replaceChildren();
    types.forEach((type, idx) => {
      const card = document.createElement("article");
      card.className = "members__appt-type-card";

      const photoWrap = document.createElement("div");
      photoWrap.className = "members__appt-type-card-photo";
      const img = document.createElement("img");
      img.src = PHOTOS[idx % PHOTOS.length];
      img.alt = "";
      img.loading = "lazy";
      photoWrap.append(img);

      const body = document.createElement("div");
      body.className = "members__appt-type-card-body";

      const heading = document.createElement("h4");
      heading.textContent = type.title;

      const desc = document.createElement("p");
      desc.textContent = type.description;

      const dur = document.createElement("span");
      dur.className = "members__appt-duration";
      dur.textContent = formatDuration(type.duration_minutes).replace("Duration: ", "");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "members__appt-book-btn";
      btn.textContent = "Book appointment →";
      btn.addEventListener("click", () => {
        // Pre-select in the form radio list and jump to booking section
        const radio = radioList?.querySelector(`input[value="${type.id}"]`);
        if (radio) { radio.checked = true; }
        goToStep(0);
        document.getElementById("bookAppointmentTitle")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      body.append(heading, desc, dur, btn);
      card.append(photoWrap, body);
      typeList.append(card);
    });
  }

  // ── Radio list (step 1 in booking form) ─────────────────────────────────

  function renderRadioList() {
    if (!radioList) return;
    radioList.replaceChildren();
    types.forEach(type => {
      const label = document.createElement("label");
      label.className = "members__appt-radio-item";
      const input = document.createElement("input");
      input.type  = "radio";
      input.name  = "appointmentType";
      input.value = type.id;
      const span = document.createElement("span");
      span.textContent = type.title;
      label.append(input, span);
      radioList.append(label);
    });
  }

  // ── Dates & slots ────────────────────────────────────────────────────────

  function renderDates() {
    if (!dateSelect) return;
    const dates = [...new Map(slots.map(s => [new Date(s.starts_at).toISOString().slice(0, 10), s])).keys()];
    dateSelect.replaceChildren(new Option("Choose a date", ""));
    dates.forEach(val => dateSelect.append(new Option(dateFormat.format(new Date(`${val}T12:00:00`)), val)));
  }

  function renderTimeSlots() {
    if (!slotList || !slotInput) return;
    const date = dateSelect?.value || "";
    slotList.replaceChildren();
    slotInput.value = "";
    slots
      .filter(s => new Date(s.starts_at).toISOString().slice(0, 10) === date)
      .forEach(slot => {
        const btn = document.createElement("button");
        btn.type      = "button";
        btn.className = "members__appt-slot-btn";
        btn.textContent = `${timeFormat.format(new Date(slot.starts_at))} – ${timeFormat.format(new Date(slot.ends_at))}`;
        btn.dataset.slotId = slot.id;
        btn.addEventListener("click", () => {
          slotList.querySelectorAll(".members__appt-slot-btn").forEach(b => b.classList.remove("is-selected"));
          btn.classList.add("is-selected");
          slotInput.value = slot.id;
        });
        slotList.append(btn);
      });
  }

  dateSelect?.addEventListener("change", renderTimeSlots);

  // ── Review ───────────────────────────────────────────────────────────────

  function selectedType() {
    const checked = radioList?.querySelector("input[type=radio]:checked");
    return checked ? types.find(t => t.id === checked.value) : null;
  }

  function selectedSlot() {
    return slotInput?.value ? slots.find(s => s.id === slotInput.value) : null;
  }

  function updateReview() {
    const type = selectedType();
    const slot = selectedSlot();
    const name = nameInput?.value.trim() || "—";
    const email = emailInput?.value.trim() || "—";
    submitBtn.disabled = !(type && slot && nameInput?.value.trim() && emailInput?.value.trim());
    if (reviewEl) {
      reviewEl.textContent = (type && slot)
        ? [
            `Appointment: ${type.title}`,
            `When: ${dateTimeFormat.format(new Date(slot.starts_at))}`,
            `Duration: ${formatDuration(type.duration_minutes)}`,
            `Name: ${name}`,
            `Email: ${email}`,
          ].join("\n")
        : "Choose an appointment type, date and time to review your request.";
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const type = selectedType();
    const slot = selectedSlot();
    if (!type || !slot) return;

    submitBtn.disabled = true;
    setStatus("Saving your request…");

    const { data, error } = await client.rpc("create_member_appointment", {
      p_appointment_type_id: type.id,
      p_slot_id:             slot.id,
      p_member_name:         nameInput.value.trim(),
      p_member_email:        emailInput.value.trim(),
      p_whatsapp_number:     whatsInput?.value.trim() || "",
      p_member_note:         noteInput?.value.trim()  || "",
    });

    if (error || !data?.[0]) {
      setStatus("We could not reserve that time. Please choose another available slot.");
      submitBtn.disabled = false;
      await loadSlots();
      return;
    }

    const booking = data[0];
    if (confirmDetails) {
      confirmDetails.replaceChildren();
      [
        ["Appointment", booking.appointment_title],
        ["When",        dateTimeFormat.format(new Date(booking.starts_at))],
        ["Reference",   booking.booking_reference],
      ].forEach(([label, value]) => {
        const dt = document.createElement("dt"); dt.textContent = label;
        const dd = document.createElement("dd"); dd.textContent = value;
        confirmDetails.append(dt, dd);
      });
    }

    if (confirmation) {
      confirmation.hidden = false;
      confirmation.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    form.reset();
    setStatus("");
    goToStep(0);
    await loadSlots();
    await loadBookings();
  });

  // ── Bookings list ────────────────────────────────────────────────────────

  function renderBookings(bookings) {
    if (!list) return;
    list.replaceChildren();
    if (!bookings.length) {
      list.innerHTML = `<div class="members__appt-empty">
        <span class="members__appt-empty-icon" aria-hidden="true">□</span>
        <strong>You have no upcoming appointments.</strong>
        <p>Book an appointment to get started.</p>
        <a class="members__appt-btn--sm" href="#bookAppointmentTitle">Book an appointment →</a>
      </div>`;
      return;
    }
    bookings.forEach(b => {
      const item = document.createElement("article");
      item.className = "members__appointment-booking-card";
      const title = document.createElement("h4");
      title.textContent = b.member_appointment_types?.title || "Appointment";
      const time = document.createElement("p");
      time.textContent = b.member_appointment_slots
        ? dateTimeFormat.format(new Date(b.member_appointment_slots.starts_at))
        : "Time pending";
      const meta = document.createElement("span");
      meta.textContent = `${b.status} · ${b.booking_reference}`;
      item.append(title, time, meta);
      list.append(item);
    });
  }

  async function loadBookings() {
    if (!list) return;
    const { data, error } = await client
      .from("member_appointments")
      .select("id, booking_reference, status, member_appointment_types(title), member_appointment_slots(starts_at, ends_at)")
      .in("status", ["requested", "confirmed"])
      .order("created_at", { ascending: false });
    if (error) { list.textContent = "Your appointments could not be loaded right now."; return; }
    renderBookings(data || []);
  }

  async function loadSlots() {
    const from = new Date();
    const to   = new Date(from);
    to.setDate(to.getDate() + 60);
    const { data, error } = await client.rpc("get_member_appointment_slots", {
      p_from: from.toISOString(),
      p_to:   to.toISOString(),
    });
    if (error) { setStatus("Available times could not be loaded. Please try again later."); return; }
    slots = data || [];
    renderDates();
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  async function init() {
    if (!window.supabase) return;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const { data } = await client.auth.getSession();
    if (!data.session) return;
    currentUser = data.session.user;
    if (nameInput)  nameInput.value  = currentUser.user_metadata?.full_name || "";
    if (emailInput) emailInput.value = currentUser.email || "";

    const { data: typeData, error: typeError } = await client
      .from("member_appointment_types")
      .select("id, title, description, duration_minutes")
      .order("sort_order");

    if (typeError) {
      if (typeList) typeList.textContent = "Appointment options could not be loaded.";
      return;
    }

    types = typeData || [];
    renderTypeCards();
    renderRadioList();
    goToStep(0);
    await Promise.all([loadSlots(), loadBookings()]);
  }

  init().catch(err => {
    console.error("Appointment page error:", err);
    setStatus("Appointments are temporarily unavailable.");
  });
})();
