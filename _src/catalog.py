from html import escape


def program_card(program):
    p = {key: escape(str(value)) for key, value in program.items()}
    dark = p['id'] == 'lamanho'
    terms = [('Наценка', 'markup'), ('Срок', 'duration'), ('Льготный период', 'holiday'), ('Залог', 'pledge')]
    rows = ''.join(f'<div><dt>{label}</dt><dd>{p[key]}</dd></div>' for label, key in terms)
    districts = ''.join(f'<span>{item.strip()}</span>' for item in p['districts'].split(',') if item.strip())
    if districts:
        districts = f'<div class="districts" aria-label="Районы программы">{districts}</div>'
    return f'''<article class="plate program{' plate--night' if dark else ''}" id="{p['id']}">
      <div><span class="tag{' tag--red' if dark else ''}">{p['tag']}</span>
      <h3>{p['title']}</h3><p class="program__lead">{p['description']}</p></div>
      <dl class="kv">{rows}</dl>{districts}
      <div class="program__actions"><a class="btn btn--{'light' if dark else 'primary'}" href="apply.html">Подать заявку</a>
      <a class="link" href="calculator.html#{p['id']}">Рассчитать платёж <svg><use href="#i-arrow"/></svg></a></div></article>'''


def program_button(p):
    selected = p['id'] == 'main'
    title = 'Основная программа' if selected and p['title'] == 'Основное финансирование' else escape(p['title'])
    return (f'<button type="button" data-program="{escape(p["id"])}" data-rate="{p["rate"]}" '
            f'data-grace="{p["grace"]}" data-term="{p["term"]}" aria-pressed="{str(selected).lower()}">{title}</button>')
