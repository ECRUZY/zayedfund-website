'use strict';
(() => {
  const dialog = document.querySelector('#proof');
  const frame = dialog.querySelector('iframe');
  const message = document.querySelector('#proof-message');
  let templates;
  const entities = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => entities[c]);
  function fill(template, fields) {
    return template.replace(/\{\{(\w+)\}\}/g, (_,key) => escape(fields[key]));
  }
  function project(fields) {
    const image = fields.photo ? '<img class="pdialog__img" alt="" src="' + escape(fields.photo) + '">' : '';
    const paragraphs = fields.text.split(/\n+/).filter(Boolean).map(line => '<p>' + escape(line) + '</p>').join('');
    return '<article class="project-proof">' + image + '<div class="pdialog__body"><span class="project__meta">' +
      escape(fields.category) + '</span><h2>' + escape(fields.title) + '</h2><div class="pdialog__text">' +
      paragraphs + '</div></div></article>';
  }
  async function draft(fields) {
    if (kind === 'projects') return project(fields);
    if (kind === 'programs') {
      const source = templates.programs[current === 'lamanho' ? 'lamanho' : 'main'];
      const districts = fields.districts.split(',').map(x => x.trim()).filter(Boolean);
      const card = fill(source.replace(/<div class="districts"[^>]*>.*?<\/div>/s,
        districts.length ? '<div class="districts">' + districts.map((_,i) => '<span>{{district'+i+'}}</span>').join('') + '</div>' : ''),
        {...fields, ...Object.fromEntries(districts.map((d,i) => ['district'+i,d]))});
      return '<div class="program-proof">' + card + '</div>';
    }
    let template = templates.home[current];
    if (template.includes('<!-- include:calc -->')) {
      const response = await fetch('/calculator.html');
      if (!response.ok) throw Error();
      const page = new DOMParser().parseFromString(await response.text(),'text/html');
      template = template.replace('<!-- include:calc -->', () => page.querySelector('[data-calc]').outerHTML);
    }
    return fill(template,fields);
  }
  document.querySelector('#preview').onclick = async () => {
    if (photosPending) return status('Дождитесь обработки фотографии.', true);
    const fields = Object.fromEntries(new FormData(document.querySelector('#editor')));
    dialog.showModal();
    frame.hidden = true; message.textContent = 'Загружаем предпросмотр…';
    try {
      if (!templates) {
        const response = await fetch('/assets/admin/preview.json');
        if (!response.ok) throw Error();
        templates = await response.json();
      }
      const content = await draft(fields);
      if (!dialog.open) return;
      frame.srcdoc = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<link rel="stylesheet" href="/assets/css/site.css"><link rel="stylesheet" href="/assets/css/admin-proof.css"></head><body>' +
        templates.icons + content + '</body></html>';
      message.textContent = ''; frame.hidden = false;
    } catch {
      message.textContent = 'Не удалось открыть предпросмотр. Вернитесь в редактор и попробуйте ещё раз.';
    }
  };
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('a,button,input,select').forEach(element => {
      element.removeAttribute('href'); element.setAttribute('tabindex','-1');
      if ('disabled' in element) element.disabled = true;
    });
  });
  document.querySelector('#close-proof').onclick = () => dialog.close();
  dialog.addEventListener('close', () => frame.removeAttribute('srcdoc'));
})();
