// Калькулятор платежа. Формула — как в Excel-таблице фонда (лист «Традиционный займ»):
// в льготный период платежей нет, наценка начисляется на сумму (сумма × ставка / 12 в месяц,
// без капитализации) и прибавляется к долгу; затем долг гасится равными платежами
// ПЛТ(ставка / 12; срок; долг). Ставка здесь — расчётная годовая из ячейки B11.
(function () {
  "use strict";

  var MAX_GRACE = 12, MAX_TERM = 60;

  var nf2 = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
  var money = function (x) { return nf2.format(x) + " ₽"; };
  var num = function (s) { var v = parseFloat(String(s).replace(/[\s ]/g, "").replace(",", ".")); return isFinite(v) ? v : NaN; };
  var months = function (n) {
    var a = n % 100, b = n % 10;
    if (a > 10 && a < 20) return n + " месяцев";
    if (b === 1) return n + " месяц";
    if (b > 1 && b < 5) return n + " месяца";
    return n + " месяцев";
  };

  // Smoothly count a number element from its previous value to the new one
  function tween(el, to, fmt) {
    var from = el._v == null ? to : el._v, start = performance.now(), dur = 450;
    el._v = to;
    cancelAnimationFrame(el._raf);
    if (from === to || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) { el.textContent = fmt(to); return; }
    (function step(now) {
      var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) el._raf = requestAnimationFrame(step);
    })(start);
  }

  function calc(amount, rate, grace, term) {
    var i = rate / 100 / 12;
    var debt = amount * (1 + i * grace);
    var payment = i === 0 ? debt / term : debt * i / (1 - Math.pow(1 + i, -term));
    var total = payment * term;
    return { payment: payment, total: total, markup: total - amount };
  }

  // Smallest whole term whose payment fits into the budget
  function termFor(amount, rate, grace, budget) {
    for (var n = 1; n <= MAX_TERM; n++) if (calc(amount, rate, grace, n).payment <= budget + 0.005) return n;
    return null;
  }

  document.querySelectorAll("[data-calc]").forEach(function (root) {
    var $ = function (s) { return root.querySelector(s); };
    var out = function (k) { return root.querySelector('[data-out="' + k + '"]'); };
    var amountEl = $("#calc-amount"), termEl = $("#calc-term"), graceEl = $("#calc-grace"), budgetEl = $("#calc-budget");
    var programs = new Map();
    root.querySelectorAll("[data-program]").forEach(function (button) {
      var data = button.dataset;
      programs.set(data.program, { rate: Number(data.rate), grace: Number(data.grace), term: Number(data.term) });
    });
    var state = { program: "main", mode: "pay" };

    function setPressed(list, test) { list.forEach(function (b) { b.setAttribute("aria-pressed", test(b)); }); }

    function fail(msg) {
      out("big").textContent = "—"; out("big")._v = null;
      out("sub").innerHTML = '<span class="calc__error">' + msg + "</span>";
      ["markup", "pct", "total-term", "total", "legG", "legP"].forEach(function (k) { out(k).textContent = "—"; });
      out("barG").style.flex = "0"; out("barP").style.flex = "1";
    }

    function render() {
      var p = programs.get(state.program);
      var amount = num(amountEl.value), grace = Math.round(num(graceEl.value)), term = Math.round(num(termEl.value)), budget = num(budgetEl.value);

      setPressed(root.querySelectorAll("[data-program]"), function (b) { return b.dataset.program === state.program; });
      setPressed(root.querySelectorAll("[data-mode]"), function (b) { return b.dataset.mode === state.mode; });
      setPressed(root.querySelectorAll("[data-purpose] [data-term]"), function (b) { return +b.dataset.grace === grace && +b.dataset.term === term; });
      $("[data-purpose]").hidden = state.program !== "main" || state.mode !== "pay";
      $("[data-term-field]").hidden = state.mode !== "pay";
      $("[data-pay-field]").hidden = state.mode !== "term";

      if (!(amount > 0)) return fail("Укажите сумму финансирования.");
      if (!(grace >= 0)) return fail("Укажите льготный период.");
      if (state.mode === "term") {
        if (!(budget > 0)) return fail("Укажите платёж в месяц.");
        term = termFor(amount, p.rate, grace, budget);
        if (!term) return fail("Платёж недостаточен для этой суммы. Минимальный платёж: " + money(calc(amount, p.rate, grace, MAX_TERM).payment) + ".");
      }
      if (!(term >= 1)) return fail("Укажите срок.");

      var r = calc(amount, p.rate, grace, term);
      var total = grace + term;
      if (state.mode === "pay") {
        out("label").textContent = "Ежемесячный платёж";
        tween(out("big"), r.payment, money);
        out("sub").textContent = (grace ? "С " + (grace + 1) + "-го месяца, " : "") + months(term) + " подряд";
      } else {
        out("label").textContent = "Срок без льготного периода";
        out("big").textContent = months(term); out("big")._v = null;
        out("sub").textContent = "Платёж " + money(r.payment) + " в месяц";
      }
      out("barG").style.flex = String(grace); out("barP").style.flex = String(term);
      out("legG").textContent = "Льготный период — " + months(grace);
      out("legP").textContent = "Платежи — " + months(term);
      out("markup").textContent = money(r.markup);
      out("pct").textContent = nf0.format(r.markup / amount * 100) + "%";
      out("total-term").textContent = months(total);
      out("total").textContent = money(r.total);
    }

    // Live thousands grouping that keeps the caret in place
    root.querySelectorAll("[data-money]").forEach(function (el) {
      el.addEventListener("input", function () {
        var raw = el.value, caret = el.selectionStart == null ? raw.length : el.selectionStart;
        var before = raw.slice(0, caret).replace(/\D/g, "").length;
        var out_ = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        el.value = out_;
        var pos = 0, seen = 0;
        while (pos < out_.length && seen < before) { if (out_[pos] !== " ") seen++; pos++; }
        try { el.setSelectionRange(pos, pos); } catch (e) { /* not supported */ }
        render();
      });
    });
    // Silent caps: grace up to 12 months, term up to 60 months
    [[graceEl, MAX_GRACE], [termEl, MAX_TERM]].forEach(function (pair) {
      pair[0].addEventListener("input", function () {
        pair[0].value = pair[0].value.replace(/\D/g, "");
        if (num(pair[0].value) > pair[1]) pair[0].value = pair[1];
        render();
      });
    });
    root.querySelectorAll("[data-program]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.program = b.dataset.program;
        var p = programs.get(state.program);
        graceEl.value = p.grace; termEl.value = p.term;
        render();
      });
    });
    root.querySelectorAll("[data-mode]").forEach(function (b) {
      b.addEventListener("click", function () { state.mode = b.dataset.mode; render(); });
    });
    root.querySelectorAll("[data-purpose] [data-term]").forEach(function (b) {
      b.addEventListener("click", function () { graceEl.value = b.dataset.grace; termEl.value = b.dataset.term; render(); });
    });
    var initial = location.hash.slice(1);
    if (programs.has(initial)) state.program = initial;
    var defaults = programs.get(state.program);
    graceEl.value = defaults.grace;
    termEl.value = defaults.term;
    render();
  });
})();
