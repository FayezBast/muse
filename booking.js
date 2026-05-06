const dateSelector = document.querySelector("#date-selector");
const classList = document.querySelector("#class-list");
const selectedDateLabel = document.querySelector("#selected-date-label");
const selectedDateCopy = document.querySelector("#selected-date-copy");
const bookingSelectionNote = document.querySelector("#booking-selection-note");
const bookingSessionInput = document.querySelector("#booking-session");
const bookingDateField = document.querySelector("#booking-date");
const bookingTimeField = document.querySelector("#booking-time");
const bookingNotesField = document.querySelector("#booking-notes");
const bookingRequestTypeInput = document.querySelector("#booking-request-type");
const bookingModal = document.querySelector("#booking-modal");
const bookingModalDialog = document.querySelector(".booking-modal-dialog");
const bookingOpenTriggers = document.querySelectorAll("[data-open-booking]");
const bookingCloseTriggers = document.querySelectorAll("[data-close-booking]");
const bookingNameField = document.querySelector("#booking-name");

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const weeklySchedule = [
  {
    summary:
      "A balanced mix of early reformer work, sculpt, and evening reset classes.",
    classes: [
      {
        time: "06:30 AM",
        title: "Sunrise Flow",
        instructor: "Amara Chen",
        duration: "55 min",
        spots: 3,
        intensity: "Low",
      },
      {
        time: "08:00 AM",
        title: "Reformer Sculpt",
        instructor: "Lina Voss",
        duration: "50 min",
        spots: 1,
        intensity: "High",
      },
      {
        time: "06:00 PM",
        title: "Balance Flow",
        instructor: "Suki Park",
        duration: "50 min",
        spots: 4,
        intensity: "Medium",
      },
    ],
  },
  {
    summary:
      "A stronger morning lineup with mat work, power sessions, and evening release.",
    classes: [
      {
        time: "08:00 AM",
        title: "Reformer Sculpt",
        instructor: "Lina Voss",
        duration: "50 min",
        spots: 2,
        intensity: "High",
      },
      {
        time: "10:00 AM",
        title: "Mat Foundations",
        instructor: "Jules Moreau",
        duration: "45 min",
        spots: 6,
        intensity: "Low",
      },
      {
        time: "06:30 PM",
        title: "Evening Stretch",
        instructor: "Suki Park",
        duration: "45 min",
        spots: 2,
        intensity: "Low",
      },
    ],
  },
  {
    summary:
      "Midweek sessions focused on sculpt, posture, and private appointments.",
    classes: [
      {
        time: "07:30 AM",
        title: "Reformer Sculpt",
        instructor: "Amara Chen",
        duration: "50 min",
        spots: 4,
        intensity: "High",
      },
      {
        time: "12:00 PM",
        title: "Power Pilates",
        instructor: "Lina Voss",
        duration: "55 min",
        spots: 0,
        intensity: "High",
      },
      {
        time: "07:30 PM",
        title: "Private Session",
        instructor: "Studio Team",
        duration: "60 min",
        spots: 2,
        intensity: "Medium",
      },
    ],
  },
  {
    summary:
      "A calmer rhythm with restore sessions, foundational work, and private bookings.",
    classes: [
      {
        time: "06:30 AM",
        title: "Sunrise Flow",
        instructor: "Suki Park",
        duration: "55 min",
        spots: 5,
        intensity: "Low",
      },
      {
        time: "09:30 AM",
        title: "Mat Foundations",
        instructor: "Jules Moreau",
        duration: "45 min",
        spots: 3,
        intensity: "Low",
      },
      {
        time: "06:00 PM",
        title: "Balance Flow",
        instructor: "Amara Chen",
        duration: "50 min",
        spots: 3,
        intensity: "Medium",
      },
    ],
  },
  {
    summary:
      "Sharper energy across the day with reformer, power work, and private sessions.",
    classes: [
      {
        time: "08:00 AM",
        title: "Reformer Sculpt",
        instructor: "Lina Voss",
        duration: "50 min",
        spots: 2,
        intensity: "High",
      },
      {
        time: "12:00 PM",
        title: "Power Pilates",
        instructor: "Amara Chen",
        duration: "55 min",
        spots: 1,
        intensity: "High",
      },
      {
        time: "07:30 PM",
        title: "Private Session",
        instructor: "Studio Team",
        duration: "60 min",
        spots: 1,
        intensity: "Medium",
      },
    ],
  },
  {
    summary:
      "Friday sessions favor sculpt, lengthening work, and softer evening movement.",
    classes: [
      {
        time: "08:00 AM",
        title: "Reformer Sculpt",
        instructor: "Lina Voss",
        duration: "50 min",
        spots: 5,
        intensity: "High",
      },
      {
        time: "04:30 PM",
        title: "Balance Flow",
        instructor: "Suki Park",
        duration: "50 min",
        spots: 4,
        intensity: "Medium",
      },
      {
        time: "06:30 PM",
        title: "Evening Stretch",
        instructor: "Jules Moreau",
        duration: "45 min",
        spots: 3,
        intensity: "Low",
      },
    ],
  },
  {
    summary:
      "Weekend classes are lighter, longer, and ideal for reset or private bookings.",
    classes: [
      {
        time: "09:00 AM",
        title: "Sunrise Flow",
        instructor: "Amara Chen",
        duration: "55 min",
        spots: 4,
        intensity: "Low",
      },
      {
        time: "10:30 AM",
        title: "Mat Foundations",
        instructor: "Jules Moreau",
        duration: "45 min",
        spots: 5,
        intensity: "Low",
      },
      {
        time: "12:30 PM",
        title: "Private Session",
        instructor: "Studio Team",
        duration: "60 min",
        spots: 2,
        intensity: "Medium",
      },
    ],
  },
];

const intensityClassName = {
  Low: "is-low",
  Medium: "is-medium",
  High: "is-high",
};

const formatIsoDate = (date) => {
  const adjusted = new Date(date);
  adjusted.setMinutes(adjusted.getMinutes() - adjusted.getTimezoneOffset());
  return adjusted.toISOString().split("T")[0];
};

const dates = Array.from({ length: 7 }, (_, index) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + index);
  return date;
});

let selectedDateIndex = 0;
const defaultBookingSelectionNote = bookingSelectionNote?.textContent.trim() || "";
let lastBookingTrigger = null;

const openBookingModal = (selectedDate = dates[selectedDateIndex]) => {
  if (!bookingModal) {
    return;
  }

  if (bookingDateField && !bookingDateField.value) {
    bookingDateField.value = formatIsoDate(selectedDate);
  }

  if (bookingRequestTypeInput && !bookingSessionInput?.value) {
    bookingRequestTypeInput.value = "booking";
  }

  if (bookingSelectionNote && !bookingSessionInput?.value) {
    bookingSelectionNote.textContent = defaultBookingSelectionNote;
  }

  bookingModal.hidden = false;
  document.body.classList.add("modal-open");

  window.requestAnimationFrame(() => {
    (bookingNameField || bookingSessionInput || bookingModalDialog)?.focus?.();
  });
};

const closeBookingModal = () => {
  if (!bookingModal) {
    return;
  }

  bookingModal.hidden = true;
  document.body.classList.remove("modal-open");
  lastBookingTrigger?.focus?.();
};

const buildDateButton = (date, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "date-chip";
  button.dataset.index = String(index);

  if (index === selectedDateIndex) {
    button.classList.add("is-active");
  }

  button.innerHTML = `
    <span class="date-chip-label">${index === 0 ? "Today" : dayNames[date.getDay()]}</span>
    <strong>${String(date.getDate()).padStart(2, "0")}</strong>
    <span class="date-chip-meta">${monthNames[date.getMonth()]}</span>
  `;

  button.addEventListener("click", () => {
    selectedDateIndex = index;
    renderDateButtons();
    renderSchedule();
  });

  return button;
};

const renderDateButtons = () => {
  if (!dateSelector) {
    return;
  }

  dateSelector.innerHTML = "";
  dates.forEach((date, index) => {
    dateSelector.append(buildDateButton(date, index));
  });
};

const prefillBookingForm = (bookingClass, date) => {
  if (document.activeElement instanceof HTMLElement) {
    lastBookingTrigger = document.activeElement;
  }

  if (bookingSessionInput) {
    bookingSessionInput.value = bookingClass.title;
  }

  if (bookingDateField) {
    bookingDateField.value = formatIsoDate(date);
  }

  if (bookingTimeField) {
    bookingTimeField.value = bookingClass.time;
  }

  if (bookingRequestTypeInput) {
    bookingRequestTypeInput.value = bookingClass.spots === 0 ? "waitlist" : "booking";
  }

  if (bookingNotesField && !bookingNotesField.value.trim()) {
    bookingNotesField.value = `Requested with ${bookingClass.instructor}.`;
  }

  if (bookingSelectionNote) {
    const action = bookingClass.spots === 0 ? "waitlist request" : "booking request";
    bookingSelectionNote.textContent = `${bookingClass.title} at ${bookingClass.time} has been selected for your ${action}.`;
  }

  openBookingModal(date);
};

const buildClassCard = (bookingClass, date) => {
  const article = document.createElement("article");
  article.className = "live-class-card";

  const intensityClass = intensityClassName[bookingClass.intensity] || "is-medium";
  const buttonLabel = bookingClass.spots === 0 ? "Waitlist" : "Book";

  article.innerHTML = `
    <div class="live-class-top">
      <div>
        <p class="live-class-meta">${bookingClass.time} · ${bookingClass.duration}</p>
        <h3 class="live-class-title">${bookingClass.title}</h3>
        <p class="live-class-instructor">with ${bookingClass.instructor}</p>
      </div>
      <button class="class-book-button ${bookingClass.spots === 0 ? "is-waitlist" : ""}" type="button">
        ${buttonLabel}
      </button>
    </div>
    <div class="live-class-tags">
      <span class="intensity-tag ${intensityClass}">${bookingClass.intensity} intensity</span>
      <span class="spots-tag">${bookingClass.spots === 0 ? "Class full" : `${bookingClass.spots} ${bookingClass.spots === 1 ? "spot" : "spots"} left`}</span>
    </div>
  `;

  article
    .querySelector(".class-book-button")
    ?.addEventListener("click", () => prefillBookingForm(bookingClass, date));

  return article;
};

const renderSchedule = () => {
  if (!classList) {
    return;
  }

  const activeDate = dates[selectedDateIndex];
  const daySchedule = weeklySchedule[selectedDateIndex] || weeklySchedule[0];

  if (selectedDateLabel) {
    selectedDateLabel.textContent =
      selectedDateIndex === 0
        ? "Today at MUSE"
        : `${dayNames[activeDate.getDay()]} ${activeDate.getDate()} ${monthNames[activeDate.getMonth()]}`;
  }

  if (selectedDateCopy) {
    selectedDateCopy.textContent = daySchedule.summary;
  }

  if (bookingDateField && !bookingDateField.value) {
    bookingDateField.value = formatIsoDate(activeDate);
  }

  classList.innerHTML = "";
  daySchedule.classes.forEach((bookingClass) => {
    classList.append(buildClassCard(bookingClass, activeDate));
  });
};

renderDateButtons();
renderSchedule();

bookingOpenTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    lastBookingTrigger = trigger;
    openBookingModal();
  });
});

bookingCloseTriggers.forEach((trigger) => {
  trigger.addEventListener("click", () => closeBookingModal());
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && bookingModal && !bookingModal.hidden) {
    closeBookingModal();
  }
});
