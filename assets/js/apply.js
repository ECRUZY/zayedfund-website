// Анкета заявителя: шаги, проверка полей, маски ввода, повторяющиеся блоки, файлы и отправка.
(function () {
  "use strict";
  var wizard = document.querySelector("[data-wizard]");
  if (!wizard) return;

  var form = wizard.querySelector("[data-apply-form]");
  var steps = Array.prototype.slice.call(form.querySelectorAll("[data-step]"));
  var navBtns = wizard.querySelectorAll("[data-goto]");
  var btnPrev = form.querySelector("[data-prev]"), btnNext = form.querySelector("[data-next]"), btnSubmit = form.querySelector("[data-submit]");
  var status = form.querySelector("[data-wizard-status]");
  var current = 0, reached = 0, dirty = false;
  var MAX_FILE = 10 * 1024 * 1024;

  // ---------- Masks ----------
  var digits = function (s) { return String(s).replace(/\D/g, ""); };
  var MASKS = {
    phone: function (v) {
      var d = digits(v);
      if (d[0] === "8") d = "7" + d.slice(1);
      if (d && d[0] !== "7") d = "7" + d;
      d = d.slice(0, 11);
      if (!d) return "";
      var out = "+7";
      if (d.length > 1) out += " (" + d.slice(1, 4);
      if (d.length >= 4) out += ")";
      if (d.length > 4) out += " " + d.slice(4, 7);
      if (d.length > 7) out += "-" + d.slice(7, 9);
      if (d.length > 9) out += "-" + d.slice(9, 11);
      return out;
    },
    pser: function (v) { var d = digits(v).slice(0, 4); return d.length > 2 ? d.slice(0, 2) + " " + d.slice(2) : d; },
    pnum: function (v) { return digits(v).slice(0, 6); },
    pcode: function (v) { var d = digits(v).slice(0, 6); return d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d; },
    inn: function (v) { return digits(v).slice(0, 12); },
    inn12: function (v) { return digits(v).slice(0, 12); },
    zip: function (v) { return digits(v).slice(0, 6); },
    year: function (v) { return digits(v).slice(0, 4); },
    pct: function (v) { var d = digits(v).slice(0, 3); return d && +d > 100 ? "100" : d; }
  };
  var RULES = {
    phone: [function (v) { return digits(v).length === 11; }, "Введите номер полностью"],
    pser: [function (v) { return digits(v).length === 4; }, "4 цифры"],
    pnum: [function (v) { return digits(v).length === 6; }, "6 цифр"],
    pcode: [function (v) { return digits(v).length === 6; }, "Формат 000-000"],
    inn: [function (v) { return digits(v).length === 12; }, "12 цифр"],
    inn12: [function (v) { var n = digits(v).length; return n === 10 || n === 12; }, "10 или 12 цифр"],
    zip: [function (v) { return digits(v).length === 6; }, "6 цифр"],
    year: [function (v) { var y = +v; return y >= 1940 && y <= new Date().getFullYear() + 6; }, "Укажите год"]
  };
  var money = function (v) { return digits(v).replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " "); };

  function bindInputs(scope) {
    scope.querySelectorAll("[data-mask]").forEach(function (el) {
      el.addEventListener("input", function () { el.value = MASKS[el.dataset.mask](el.value); });
    });
    scope.querySelectorAll("[data-money]").forEach(function (el) {
      el.addEventListener("input", function () { el.value = money(el.value); });
    });
  }
  bindInputs(form);

  // ---------- Validation ----------
  function isShown(el) {
    for (var n = el; n && n !== form; n = n.parentElement) if (n.hidden || n.tagName === "TEMPLATE") return false;
    return true;
  }
  function setError(field, msg) {
    if (!field) return;
    var err = field.querySelector(".field__error");
    if (msg) {
      field.classList.add("is-invalid");
      if (!err) { err = document.createElement("span"); err.className = "field__error"; field.appendChild(err); }
      err.textContent = msg;
    } else {
      field.classList.remove("is-invalid");
      if (err) err.remove();
    }
  }
  function checkControl(el) {
    var v = el.value.trim();
    if (el.type === "file") {
      var f = el.files[0];
      if (el.required && !f) return "Прикрепите файл";
      if (f && f.size > MAX_FILE) return "Файл больше 10 МБ";
      return "";
    }
    if (el.type === "radio") return el.required && !form.querySelector('input[name="' + el.name + '"]:checked') ? "Выберите вариант" : "";
    if (el.type === "checkbox") return el.required && !el.checked ? "Необходимо согласие" : "";
    if (el.required && !v) return "Заполните поле";
    if (v && el.dataset.mask && RULES[el.dataset.mask] && !RULES[el.dataset.mask][0](v)) return RULES[el.dataset.mask][1];
    if (v && el.type === "email" && !el.checkValidity()) return "Проверьте адрес почты";
    if (v && el.type === "date") {
      var d = new Date(v), now = new Date();
      if (isNaN(d) || d > now && el.name !== "debt_until[]") return "Проверьте дату";
      if (el.name === "birth_date") {
        var age = (now - d) / 31557600000;
        if (age < 18 || age > 60) return "Заявитель должен быть в возрасте 18–60 лет";
      }
    }
    return "";
  }
  function validateStep(i, focus) {
    var firstBad = null;
    steps[i].querySelectorAll("input, select, textarea").forEach(function (el) {
      if (!isShown(el) || el.disabled) return;
      if (el.type === "radio" && el !== form.querySelector('input[name="' + el.name + '"]')) return;
      var msg = checkControl(el);
      if (el.type === "file") { el.closest("[data-file]").classList.toggle("is-invalid", !!msg); }
      else if (el.type === "checkbox" && el.closest(".check")) { el.closest(".check").style.color = msg ? "var(--red)" : ""; }
      else setError(el.closest(".field"), msg);
      if (msg && !firstBad) firstBad = el;
    });
    if (firstBad && focus) {
      var target = firstBad.type === "file" ? firstBad.closest("[data-file]") : firstBad;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (firstBad.type !== "file" && firstBad.type !== "radio") setTimeout(function () { firstBad.focus({ preventScroll: true }); }, 300);
    }
    return !firstBad;
  }
  form.addEventListener("input", function (e) {
    dirty = true;
    var f = e.target.closest(".field");
    if (f && f.classList.contains("is-invalid")) setError(f, checkControl(e.target));
  });
  form.addEventListener("change", function (e) {
    dirty = true;
    if (e.target.type === "radio") setError(e.target.closest(".field"), "");
    if (e.target.type === "checkbox" && e.target.closest(".check")) e.target.closest(".check").style.color = "";
  });

  // ---------- Steps ----------
  function show(i, scroll) {
    var back = i < current;
    current = i;
    reached = Math.max(reached, i);
    steps.forEach(function (s, k) {
      s.hidden = k !== i;
      s.classList.remove("is-entering", "is-entering-back");
      if (k === i && scroll) { void s.offsetWidth; s.classList.add(back ? "is-entering-back" : "is-entering"); }
    });
    navBtns.forEach(function (b, k) {
      b.classList.toggle("is-done", k < reached && k !== i);
      b.disabled = k > reached;
      if (k === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    wizard.querySelector("[data-progress-text]").textContent = "Шаг " + (i + 1) + " из " + steps.length;
    wizard.querySelector("[data-progress-bar]").style.width = ((i + 1) / steps.length * 100) + "%";
    btnPrev.hidden = i === 0;
    btnNext.hidden = i === steps.length - 1;
    btnSubmit.hidden = i !== steps.length - 1;
    status.hidden = true;
    var active = wizard.querySelector('[aria-current="step"]');
    if (active && active.scrollIntoView && window.innerWidth <= 1000) active.scrollIntoView({ block: "nearest", inline: "center" });
    if (scroll) wizard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  btnNext.addEventListener("click", function () { if (validateStep(current, true)) show(current + 1, true); });
  btnPrev.addEventListener("click", function () { show(current - 1, true); });
  navBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var to = +b.dataset.goto;
      if (to > current && !validateStep(current, true)) return;
      show(to, true);
    });
  });

  // ---------- Toggles (switches that show/hide blocks) ----------
  form.querySelectorAll("[data-toggle]").forEach(function (sw) {
    var target = form.querySelector('[data-toggle-target="' + sw.dataset.toggle + '"]');
    var sync = function () {
      target.hidden = (target.dataset.showWhen === "on") !== sw.checked;
      var rep = target.matches("[data-repeat]") ? target : null;
      if (rep && !target.hidden && !rep.querySelector(".repeat__item")) addItem(rep);
    };
    sw.addEventListener("change", sync);
    sync();
  });

  // ---------- Repeatable groups ----------
  function renumber(rep) {
    var items = rep.querySelectorAll(".repeat__item");
    items.forEach(function (it, k) {
      it.querySelector("[data-n]").textContent = items.length > 1 ? k + 1 : "";
      it.querySelector("[data-remove]").hidden = items.length === 1 && !rep.dataset.toggleTarget;
    });
  }
  function addItem(rep) {
    var node = rep.querySelector("template").content.firstElementChild.cloneNode(true);
    rep.querySelector(".repeat__list").appendChild(node);
    bindInputs(node);
    node.querySelector("[data-remove]").addEventListener("click", function () {
      node.remove();
      if (!rep.querySelector(".repeat__item") && rep.dataset.toggleTarget) {
        var sw = form.querySelector('[data-toggle="' + rep.dataset.toggleTarget + '"]');
        sw.checked = false; sw.dispatchEvent(new Event("change"));
      }
      renumber(rep);
    });
    renumber(rep);
    return node;
  }
  form.querySelectorAll("[data-repeat]").forEach(function (rep) {
    rep.querySelector("[data-add]").addEventListener("click", function () {
      var node = addItem(rep);
      var first = node.querySelector("input, select");
      if (first) first.focus();
    });
    if (!rep.dataset.toggleTarget && !rep.querySelector(".repeat__item")) addItem(rep);
  });

  // ---------- Income total ----------
  var incomeTotal = form.querySelector("[data-income-total]");
  var nf = new Intl.NumberFormat("ru-RU");
  form.querySelectorAll("[data-income]").forEach(function (el) {
    el.addEventListener("input", function () {
      var sum = 0;
      form.querySelectorAll("[data-income]").forEach(function (x) { sum += +digits(x.value) || 0; });
      incomeTotal.textContent = nf.format(sum) + " ₽";
    });
  });

  // ---------- Files ----------
  form.querySelectorAll("[data-file]").forEach(function (box) {
    var input = box.querySelector("input"), name = box.querySelector("[data-file-name]"), hint = name.textContent;
    input.addEventListener("change", function () {
      var f = input.files[0];
      box.classList.toggle("is-filled", !!f);
      box.classList.remove("is-invalid");
      name.textContent = f ? f.name + " · " + (f.size / 1048576).toFixed(1).replace(".", ",") + " МБ" : hint;
      if (f && f.size > MAX_FILE) { box.classList.add("is-invalid"); name.textContent = "Файл больше 10 МБ"; }
    });
  });

  // ---------- Submit ----------
  function fail(html) { status.hidden = false; status.className = "wizard__status form__status form__status--err"; status.innerHTML = html; }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    for (var i = 0; i < steps.length; i++) {
      if (!validateStep(i, false)) { show(i, true); validateStep(i, true); return; }
    }
    var endpoint = window.ZF_APPLY_ENDPOINT;
    if (!endpoint) {
      fail("Онлайн-приём анкет временно недоступен. Позвоните " + window.ZF_CONTACT_PHONE + " или напишите на <a href=\"mailto:" + window.ZF_CONTACT_EMAIL + "\">" + window.ZF_CONTACT_EMAIL + "</a>.");
      return;
    }
    var data = new FormData(form);
    // Drop fields from switched-off blocks (e.g. residence address when it matches registration)
    form.querySelectorAll("[data-toggle-target][hidden] [name]").forEach(function (el) { data.delete(el.name); });
    data.append("submitted_at", new Date().toISOString());
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Отправка…";
    fetch(endpoint, { method: "POST", body: data })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        dirty = false;
        form.hidden = true;
        wizard.querySelector(".wizard__nav").hidden = true;
        wizard.querySelector("[data-done]").hidden = false;
        wizard.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(function () { fail("Анкета не отправлена. Проверьте подключение и попробуйте ещё раз или позвоните " + window.ZF_CONTACT_PHONE + "."); })
      .then(function () { btnSubmit.disabled = false; btnSubmit.textContent = "Отправить анкету"; });
  });

  window.addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  show(0, false);
})();
