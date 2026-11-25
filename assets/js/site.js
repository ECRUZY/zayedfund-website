(function () {
  "use strict";

  // Mobile menu
  var burger = document.querySelector("[data-burger]");
  var menu = document.getElementById("mobile-menu");
  if (burger && menu) {
    function toggleMenu(open) {
      menu.hidden = !open;
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
    }
    burger.addEventListener("click", function () { toggleMenu(menu.hidden); });
    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) toggleMenu(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !menu.hidden) { toggleMenu(false); burger.focus(); }
    });
    document.addEventListener("click", function (event) {
      if (!menu.hidden && !event.target.closest(".header")) toggleMenu(false);
    });
    window.matchMedia("(min-width: 901px)").addEventListener("change", function (event) {
      if (event.matches) toggleMenu(false);
    });
  }

  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // Thousands grouping for money inputs outside the calculator
  document.querySelectorAll("[data-money]").forEach(function (el) {
    if (el.closest("[data-calc]")) return;
    el.addEventListener("input", function () {
      el.value = el.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    });
  });

  // Next four Tuesdays for the consultation form
  var months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  document.querySelectorAll("[data-tuesdays]").forEach(function (sel) {
    var d = new Date(); d.setHours(12); d.setDate(d.getDate() + 1);
    var found = 0;
    while (found < 4) {
      if (d.getDay() === 2) {
        var o = document.createElement("option");
        o.textContent = d.getDate() + " " + months[d.getMonth()] + ", вторник";
        sel.appendChild(o); found++;
      }
      d.setDate(d.getDate() + 1);
    }
  });

  // Project filter
  var filters = document.querySelector("[data-filters]");
  if (filters) {
    var cards = document.querySelectorAll(".project[data-cat]");
    filters.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var f = btn.dataset.filter;
        filters.querySelectorAll("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", b === btn); });
        cards.forEach(function (c) { c.hidden = f !== "all" && c.dataset.cat !== f; });
      });
    });
  }

  document.querySelectorAll("[data-consult]").forEach(function (form) {
    var actions = form.querySelector(".consult-actions");
    var submit = form.querySelector("[type=submit]");
    function updateMessage() {
      var values = new FormData(form);
      var text = "Здравствуйте! Хочу записаться на консультацию в Фонд имени Шейха Зайеда.\n\n" +
        "Желаемая дата: " + values.get("date") + "\n" +
        "Имя: " + String(values.get("name") || "").trim() + "\n" +
        "Бизнес-идея: " + String(values.get("idea") || "").trim() + "\n\n" +
        "Подтвердите, пожалуйста, дату и время консультации.";
      form.querySelector("[data-consult-wa]").href = "https://wa.me/" + window.ZF_WHATSAPP_PHONE + "?text=" + encodeURIComponent(text);
    }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      ["name", "idea"].forEach(function (name) { form.elements[name].value = form.elements[name].value.trim(); });
      if (!form.reportValidity()) return;
      updateMessage();
      actions.hidden = false;
      submit.setAttribute("aria-expanded", "true");
      form.querySelector("[data-consult-wa]").focus({ preventScroll: true });
      actions.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
    form.addEventListener("input", function () {
      actions.hidden = true;
      submit.setAttribute("aria-expanded", "false");
    });
    form.addEventListener("change", function () {
      actions.hidden = true;
      submit.setAttribute("aria-expanded", "false");
    });
  });

  // Forms: send JSON to ZF_FORM_ENDPOINT; without an endpoint, offer phone and e-mail instead
  document.querySelectorAll("form[data-form]").forEach(function (form) {
    var status = form.querySelector("[data-status]");
    var show = function (ok, html) { status.hidden = false; status.className = "form__status " + (ok ? "form__status--ok" : "form__status--err"); status.innerHTML = html; };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var data = { type: form.dataset.form, sent_at: new Date().toISOString() };
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      var phoneDigits = String(data.phone || "").replace(/\D/g, "");
      if (phoneDigits.length < 10) { show(false, "Проверьте номер телефона."); return; }

      var endpoint = window.ZF_FORM_ENDPOINT;
      if (!endpoint) {
        var subject = { consult: "Запись на консультацию", training: "Запись на обучение", message: "Сообщение с сайта" }[data.type] || "Заявка на финансирование";
        var body = Object.keys(data).filter(function (k) { return k !== "agree" && k !== "type" && k !== "sent_at"; }).map(function (k) { return k + ": " + data[k]; }).join("\n");
        var mail = "mailto:" + window.ZF_CONTACT_EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        show(false, "Онлайн-приём заявок временно недоступен. Позвоните " + window.ZF_CONTACT_PHONE + " или <a href=\"" + mail + "\">отправьте заявку на " + window.ZF_CONTACT_EMAIL + "</a>.");
        return;
      }
      var btn = form.querySelector("[type=submit]");
      btn.disabled = true;
      fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (res) {
          if (!res.ok) throw new Error(res.status);
          form.reset();
          show(true, { consult: "Запись принята. Специалист фонда свяжется с вами для подтверждения.", training: "Запись принята. Специалист фонда сообщит даты ближайших тренингов.", message: "Сообщение отправлено. Специалист фонда свяжется с вами." }[data.type] || "Заявка принята. Специалист фонда свяжется с вами в ближайшее время.");
        })
        .catch(function () { show(false, "Заявка не отправлена. Позвоните " + window.ZF_CONTACT_PHONE + "."); })
        .then(function () { btn.disabled = false; });
    });
  });
})();

// ---------- Motion ----------
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var header = document.querySelector(".header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }
  if (reduce || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("motion");

  // Scroll reveal: only for elements that start below the fold
  var sel = ".section-head, .stats > *, .program, .tile, .compare, .calc > *, .steps > *, .result-banner, .consult > *, .industry, .split2 > *, .filters, .project, .faq details, .apply, .direction, .about-grid > *, .cond, .stage, .course, .template, .sectors > *, .page-hero ~ section .plate";
  var fold = window.innerHeight * 0.92;
  var groups = new Map();
  document.querySelectorAll(sel).forEach(function (el) {
    if (el.closest(".bento") || el.getBoundingClientRect().top < fold) return;
    var parent = el.parentElement, n = groups.get(parent) || 0;
    groups.set(parent, n + 1);
    el.style.setProperty("--i", Math.min(n, 6));
    el.classList.add("reveal");
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

  // Count-up for stat numbers
  var nf = new Intl.NumberFormat("ru-RU");
  var counter = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      counter.unobserve(e.target);
      var el = e.target, text = el.textContent, m = text.match(/\d[\d\s\u00a0]*\d|\d/);
      if (!m) return;
      var target = parseInt(m[0].replace(/\D/g, ""), 10);
      if (!target || target < 10 || target === 2017) return;
      var pre = text.slice(0, m.index), post = text.slice(m.index + m[0].length), start = performance.now(), dur = 1400;
      (function tick(now) {
        var p = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - p, 3);
        el.textContent = pre + nf.format(Math.round(target * eased)) + post;
        if (p < 1) requestAnimationFrame(tick); else el.textContent = text;
      })(start);
    });
  }, { threshold: 0.4 });
  document.querySelectorAll(".stat__num, .result-banner .big-num").forEach(function (el) { counter.observe(el); });
})();

// ---------- Project archive: search, industry filter, "show more", details dialog ----------
(function () {
  "use strict";
  var list = document.querySelector("[data-archive]");
  if (!list) return;
  var cards = Array.prototype.slice.call(list.querySelectorAll(".pcard"));
  var search = document.querySelector("[data-archive-search]"), cat = document.querySelector("[data-archive-cat]");
  var more = document.querySelector("[data-archive-more]"), count = document.querySelector("[data-archive-count]"), empty = document.querySelector("[data-archive-empty]");
  var PAGE = 16, shown = PAGE;
  var plural = function (n) { var a = n % 100, b = n % 10; return a > 10 && a < 20 ? "проектов" : b === 1 ? "проект" : b > 1 && b < 5 ? "проекта" : "проектов"; };
  function apply() {
    var q = search.value.trim().toLowerCase(), c = cat.value, matched = 0;
    cards.forEach(function (el) {
      var ok = (!c || el.dataset.cat === c) && (!q || el.dataset.search.indexOf(q) !== -1);
      if (ok) matched++;
      el.hidden = !ok || matched > shown;
    });
    count.textContent = (q || c ? "Найдено: " : "В архиве ") + matched + " " + plural(matched);
    more.hidden = matched <= shown;
    empty.hidden = matched > 0;
  }
  search.addEventListener("input", function () { shown = PAGE; apply(); });
  cat.addEventListener("change", function () { shown = PAGE; apply(); });
  more.addEventListener("click", function () { shown += PAGE; apply(); });
  apply();

  var dlg = document.querySelector("[data-pdialog]");
  if (!dlg || typeof dlg.showModal !== "function") return;
  list.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-open]");
    if (!btn) return;
    var card = btn.closest(".pcard"), img = card.querySelector("img");
    dlg.querySelector("[data-pd-img]").src = img.src;
    dlg.querySelector("[data-pd-img]").alt = img.alt;
    dlg.querySelector("[data-pd-cat]").textContent = card.dataset.cat;
    dlg.querySelector("[data-pd-title]").textContent = card.querySelector(".pcard__title").textContent;
    dlg.querySelector("[data-pd-text]").innerHTML = card.querySelector(".pcard__full").innerHTML;
    dlg.showModal();
    dlg.scrollTop = 0;
  });
  dlg.querySelector("[data-pdialog-close]").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
})();

// ---------- FAQ search ----------
(function () {
  "use strict";
  var input = document.querySelector("[data-faq-search]");
  if (!input) return;
  var items = document.querySelectorAll("[data-faq] details"), empty = document.querySelector("[data-faq-empty]");
  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase(), n = 0;
    items.forEach(function (d) {
      var ok = !q || d.textContent.toLowerCase().indexOf(q) !== -1;
      d.hidden = !ok;
      if (ok) n++;
    });
    empty.hidden = n > 0;
  });
})();
