'use strict';
const $ = selector => document.querySelector(selector);
const sections = {
  home: ['Блоки главной', '', '/index.html'],
  projects: ['Архив проектов', 'Добавить проект', '/projects.html'],
  programs: ['Программы фонда', 'Добавить программу', '/funding.html#programs']
};
const projectFields = {title:'Название', category:'Отрасль', text:'Описание (каждый абзац с новой строки)', photo:'Фотография'};
const programFields = {
  title:'Название программы', tag:'Метка на карточке', description:'Описание', markup:'Наценка на карточке',
  duration:'Общий срок на карточке', holiday:'Льготный период на карточке', pledge:'Залог',
  districts:'Районы через запятую (при необходимости)', rate:'Расчётная годовая ставка калькулятора, %',
  grace:'Льготный период калькулятора, 0–12 месяцев', term:'Срок погашения после льготного периода, 1–60 месяцев'
};
let data, kind = 'home', current, dirty = false, busy = false, photosPending = 0;
let selectionVersion = 0;
function status(message, error = false) {
  $('#status').textContent = message;
  $('#status').classList.toggle('error', error);
}
function el(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
async function api(path, body) {
  const options = body === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)};
  const response = await fetch('/admin/' + path, options);
  const result = await response.json();
  if (!response.ok) throw Error(result.error || (response.status === 401 ? 'Для входа откройте файл «Панель фонда.command».' : 'Операция не выполнена.'));
  return result;
}
function canLeave() {
  return !busy && (!dirty || window.confirm('Перейти без сохранения изменений?'));
}
function entries() {
  return kind === 'home' ? Object.keys(data.home).map(id => ({id, title:id})) : data[kind];
}
const sectionIcons = {
  'Первый экран':'layout-template', 'Показатели фонда':'chart-no-axes-column-increasing',
  'Условия финансирования':'columns-3', 'Калькулятор':'calculator', 'Этапы рассмотрения':'list-checks',
  'Отрасли и требования':'factory', 'Проекты на главной':'images', 'Частые вопросы':'circle-help', 'Заявка':'file-pen-line'
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  const use = document.createElementNS(svg.namespaceURI,'use');
  svg.setAttribute('class','ui-icon'); svg.setAttribute('aria-hidden','true');
  use.setAttribute('href','assets/admin/icons.svg#' + name); svg.append(use);
  return svg;
}
function list() {
  const records = $('#records');
  records.replaceChildren(); records.dataset.collection = kind;
  const query = $('#search').value.trim().toLocaleLowerCase();
  for (const item of entries().filter(x => x.title.toLocaleLowerCase().includes(query))) {
    const button = el('button');
    button.className = 'record'; button.setAttribute('aria-label',item.title);
    if (kind === 'projects' && item.photo) {
      const image = el('img'); image.src = '/' + item.photo; image.alt = ''; image.loading = 'lazy';
      button.append(image);
    } else {
      button.append(icon(sectionIcons[item.title] || 'layers'));
    }
    const title = el('span', item.title);
    if (kind === 'projects') title.append(el('small',item.category));
    if (kind === 'programs') title.append(el('small', [item.markup,item.duration].join(' · ')));
    button.append(title, icon('chevron-right'));
    if (kind === 'home' && item.id === 'Первый экран') {
      const hero = data.home[item.id];
      button.classList.add('cover-record');
      title.append(el('small',hero.f2.value));
      const cover = el('img'); cover.src = '/' + hero.f13.value; cover.alt = '';
      button.append(cover);
    }
    button.type = 'button';
    button.setAttribute('aria-current', String(item.id === current));
    button.onclick = () => { openItem(item.id); };
    records.append(button);
  }
  if (!records.children.length) records.append(el('p','Совпадений нет.'));
}
function changeSection(next) {
  kind = next;
  $('#list-title').textContent = sections[kind][0];
  $('#add span').textContent = sections[kind][1];
  $('#add').hidden = kind === 'home';
  $('#back span').textContent = sections[kind][0];
  $('#search').value = '';
  for (const button of document.querySelectorAll('[data-kind]')) button.setAttribute('aria-current', String(button.dataset.kind === kind));
  showList();
}
function showList() {
  current = undefined; dirty = false; status('');
  $('#workspace').hidden = true; $('#collection').hidden = false;
  $('#search-row').hidden = kind !== 'projects';
  list(); window.scrollTo(0,0);
}
$('#back').onclick = () => { if (canLeave()) showList(); };
function changed() {
  dirty = true; $('#state').textContent = 'Есть изменения'; $('#save').disabled = false;
}
function labeled(title, input) {
  const label = el('label',title);
  label.append(input);
  return label;
}
async function resize(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 16 * 1024 * 1024) throw Error('Выберите JPEG, PNG или WebP размером до 16 МБ.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = el('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',0.82);
  } finally { bitmap.close(); }
}
function photoField(key, title, value) {
  const group = el('fieldset'), preview = el('img'), input = el('input'), select = el('select'), upload = el('input');
  input.type = 'hidden'; input.name = key;
  preview.alt = 'Выбранная фотография';
  function setPhoto(src) {
    input.value = src || '';
    preview.hidden = !src;
    if (src) preview.src = src.startsWith('data:') ? src : '/' + src;
    else preview.removeAttribute('src');
  }
  setPhoto(value);
  select.add(new Option('Выберите фотографию', ''));
  const photoTitles = new Map(data.projects.map(project => [project.photo, project.title]));
  for (const path of data.photos) select.add(new Option(photoTitles.get(path) || path.split('/').pop(),path));
  select.value = value || '';
  let version = 0;
  select.onchange = () => { version++; upload.value = ''; setPhoto(select.value); changed(); };
  upload.type = 'file'; upload.accept = 'image/jpeg,image/png,image/webp';
  upload.onchange = async () => {
    if (!upload.files[0]) return;
    const attempt = ++version, selection = selectionVersion;
    photosPending++;
    try {
      const src = await resize(upload.files[0]);
      if (attempt === version && selection === selectionVersion) {
        setPhoto(src); select.value = ''; changed();
      }
    } catch (err) {
      if (selection === selectionVersion) status(err.message, true);
      upload.value = '';
    } finally { photosPending--; }
  };
  group.className = 'photo';
  const row = el('div'); row.className = 'photo-row';
  const choose = labeled('Загрузить фото',upload); choose.className = 'upload btn btn--secondary btn--sm'; choose.prepend(icon('image-up'));
  row.append(preview,choose);
  const library = el('details'); select.className = 'select'; select.setAttribute('aria-label','Фото из библиотеки');
  library.append(el('summary','Выбрать из библиотеки'),select);
  group.append(el('legend',title),row,library,input);
  return group;
}
function field(key, title, value, photo, multiline) {
  if (photo) return photoField(key,title,value);
  const input = el(multiline ? 'textarea' : 'input'); input.className = 'input';
  input.name = key; input.value = value ?? ''; input.required = key !== 'districts';
  if (kind === 'programs' && ['rate','grace','term'].includes(key)) {
    input.type = 'number'; input.min = key === 'term' ? '1' : '0';
    input.max = String({rate:100, grace:12, term:60}[key]);
    input.step = key === 'rate' ? 'any' : '1';
  }
  return labeled(title,input);
}
const homeGroups = {
  'Первый экран': [[1,'Заголовок и кнопки'],[6,'Условия финансирования'],[13,'Фотография и подпись']],
  'Показатели фонда': [[1,'Показатели']],
  'Условия финансирования': [[1,'Условия']],
  'Этапы рассмотрения': [[1,'Заголовок и ссылка'],[3,'Этапы'],[19,'Результат']],
  'Отрасли и требования': [[1,'Заголовок и описание'],[3,'Отрасли'],[23,'Расходы и требования']],
  'Проекты на главной': [[1,'Заголовок и фильтры'],[8,'Первый проект'],[17,'Второй проект'],[22,'Третий проект'],[27,'Четвёртый проект']],
  'Частые вопросы': [[1,'Заголовок и ссылка']],
  'Заявка': [[1,'Текст и кнопки'],[5,'Этапы заявки']]
};
function fieldGroup(title, open) {
  const group = el('details'); group.className = 'field-group'; group.open = open;
  const body = el('div'); body.className = 'field-body';
  group.append(el('summary',title),body); $('#fields').append(group);
  return body;
}
function openItem(id) {
  selectionVersion++;
  current = id; dirty = false; status('');
  $('#collection').hidden = true; $('#workspace').hidden = false;
  $('#state').textContent = id == null ? 'Новая запись' : ''; $('#save').disabled = id != null;
  const container = $('#fields'); container.replaceChildren();
  let body = container;
  if (kind === 'home') {
    $('#form-title').textContent = id;
    const boundaries = new Map(homeGroups[id] || [[1,'Содержимое блока']]);
    for (const [key,f] of Object.entries(data.home[id])) {
      const n = Number(key.slice(1));
      if (id === 'Частые вопросы' && n >= 3 && n % 2 === 1) boundaries.set(n,f.value);
      if (boundaries.has(n)) body = fieldGroup(boundaries.get(n), n === 1);
      body.append(field(key,f.label,f.value,f.kind === 'photo',f.value.length > 75));
    }
  } else {
    const record = data[kind].find(x => x.id === id) || {};
    $('#form-title').textContent = record.title || (kind === 'projects' ? 'Новый проект' : 'Новая программа');
    for (const [key,label] of Object.entries(kind === 'projects' ? projectFields : programFields)) {
      const value = key === 'text' ? record.text?.join('\n\n') : record[key];
      if (kind === 'programs') {
        const groups = {title:'Название и описание', markup:'Условия программы', rate:'Параметры калькулятора'};
        if (groups[key]) body = fieldGroup(groups[key], key === 'title');
      }
      body.append(field(key,label,value,key === 'photo',key === 'description' || key === 'text'));
    }
  }
  window.scrollTo(0,0); $('#form-title').focus({preventScroll:true});
}
$('#search').oninput = list;
$('#add').onclick = () => { if (canLeave()) openItem(null); };
for (const button of document.querySelectorAll('[data-kind]')) button.onclick = () => {
  if (data && canLeave()) changeSection(button.dataset.kind);
};
$('#editor').oninput = event => {
  changed();
  if (event.target.name === 'title') {
    $('#form-title').textContent = event.target.value.trim() || (kind === 'projects' ? 'Новый проект' : 'Новая программа');
  }
};
$('#editor').addEventListener('invalid', event => {
  let group = event.target.closest('details');
  while (group) { group.open = true; group = group.parentElement.closest('details'); }
}, true);
window.addEventListener('beforeunload', event => { if (dirty) {event.preventDefault(); event.returnValue = '';} });
$('#editor').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  if (photosPending) return status('Дождитесь обработки фотографии.', true);
  const fields = Object.fromEntries(new FormData(event.target));
  if (kind === 'projects' && !fields.photo) {
    status('Добавьте фотографию проекта или выберите её из библиотеки.', true);
    $('#fields input[type=file]').focus();
    return;
  }
  busy = true;
  $('#save').disabled = true;
  $('#editor').inert = true;
  try {
    const previous = new Set(entries().map(x => x.id));
    data = await api('save',{revision:data.revision, kind, id:current, fields});
    openItem(current ?? entries().find(x => !previous.has(x.id)).id);
    $('#state').textContent = 'Сохранено'; status('Изменения сохранены.');
  } catch (err) {status(err.message, true);}
  finally {busy = false; $('#editor').inert = false; $('#save').disabled = !dirty && current != null;}
};
async function enter(token) {
  try {
    if (token) await api('login',{token});
    data = await api('data');
    changeSection('home');
    $('#login').hidden = true;
    $('.layout').hidden = false;
  } catch (err) {
    $('#login').hidden = false;
    status('Введите код из файла «~/Library/Application Support/ZayedFund/admin-code.txt».', true);
  }
}
$('#login').onsubmit = event => {
  event.preventDefault();
  const input = event.target.elements.token;
  enter(input.value.trim());
  input.value = '';
};
if (location.protocol === 'file:') {
  location.replace('http://127.0.0.1:18769/admin.html');
} else {
  const token = location.hash.slice(1);
  history.replaceState(null,'',location.pathname);
  enter(token);
}
