const root = document.documentElement;
const revealItems = document.querySelectorAll(".reveal");
const parallaxRoot = document.querySelector("[data-parallax-root]");
const parallaxItems = document.querySelectorAll("[data-depth]");
const waitlistForm = document.querySelector("#waitlist-form");
const waitlistNote = document.querySelector("#waitlist-note");
const bookingForm = document.querySelector("#booking-form");
const bookingNote = document.querySelector("#booking-note");
const bookingDateInput = document.querySelector("#booking-date");

const setBookingMinDate = () => {
  if (!bookingDateInput) {
    return;
  }

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  bookingDateInput.min = now.toISOString().split("T")[0];
};

const formatSelectedDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
  }).format(date);
};

const updatePointerGlow = (event) => {
  root.style.setProperty("--cursor-x", `${event.clientX}px`);
  root.style.setProperty("--cursor-y", `${event.clientY}px`);

  if (!parallaxRoot) {
    return;
  }

  const bounds = parallaxRoot.getBoundingClientRect();
  const relativeX = (event.clientX - bounds.left) / bounds.width - 0.5;
  const relativeY = (event.clientY - bounds.top) / bounds.height - 0.5;

  parallaxItems.forEach((item) => {
    const depth = Number(item.dataset.depth || 0);
    const rotate = item.classList.contains("paper-right")
      ? 8
      : item.classList.contains("paper-left")
        ? -7
        : -2;
    const x = relativeX * depth * 46;
    const y = relativeY * depth * 34;

    let transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg)`;

    if (item.classList.contains("paper-bottom")) {
      transform = `translate3d(calc(-50% + ${x}px), ${y}px, 0) rotate(${rotate}deg)`;
    }

    item.style.transform = transform;
  });
};

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px",
    }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

window.addEventListener("pointermove", updatePointerGlow, { passive: true });
setBookingMinDate();

const bindDemoForm = (form, note, buildResult) => {
  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const result = buildResult(new FormData(form));

    if (note) {
      note.textContent = result.message;
    }

    if (result.reset) {
      form.reset();
      setBookingMinDate();
    }
  });
};

bindDemoForm(waitlistForm, waitlistNote, (data) => {
  const email = String(data.get("email") || "").trim();

  if (!email) {
    return {
      message: "Add your email first.",
      reset: false,
    };
  }

  return {
    message: `${email} added to the demo waitlist. Replace this handler with your real CRM or booking flow.`,
    reset: true,
  };
});

bindDemoForm(bookingForm, bookingNote, (data) => {
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const session = String(data.get("session") || "").trim();
  const date = String(data.get("date") || "").trim();
  const time = String(data.get("time") || "").trim();
  const requestType = String(data.get("requestType") || "booking").trim();

  if (!name || !email || !session || !date || !time) {
    return {
      message: "Complete the name, email, session, date, and time fields.",
      reset: false,
    };
  }

  const requestLabel =
    requestType === "waitlist" ? "waitlist request" : "booking request";

  return {
    message: `Thanks, ${name}. Your ${session} ${requestLabel} for ${formatSelectedDate(date)} at ${time} has been received. We will confirm availability shortly by email.`,
    reset: true,
  };
});
