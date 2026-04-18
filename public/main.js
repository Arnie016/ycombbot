const counters = document.querySelectorAll("[data-count]");
const reveals = document.querySelectorAll("[data-reveal]");

const formatCounter = (value) => {
  if (value >= 1000) {
    return value.toLocaleString("en-US");
  }

  return String(value);
};

const animateCounter = (element) => {
  const target = Number(element.getAttribute("data-count"));
  if (!Number.isFinite(target) || element.dataset.animated === "true") {
    return;
  }

  element.dataset.animated = "true";
  const duration = 1400;
  const startTime = performance.now();

  const update = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatCounter(Math.round(target * eased));

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  };

  requestAnimationFrame(update);
};

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      entry.target.classList.add("is-visible");

      if (entry.target.hasAttribute("data-count")) {
        animateCounter(entry.target);
      }

      observer.unobserve(entry.target);
    });
  },
  {
    threshold: 0.2,
    rootMargin: "0px 0px -40px"
  }
);

reveals.forEach((element) => observer.observe(element));

window.addEventListener("load", () => {
  document.querySelector(".hero-copy")?.classList.add("is-visible");
  document.querySelector(".constellation-panel")?.classList.add("is-visible");
  counters.forEach((element) => animateCounter(element));
});
