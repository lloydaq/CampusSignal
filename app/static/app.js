const form = document.querySelector('#incident-form');
const message = document.querySelector('#form-message');
const list = document.querySelector('#incidents');
const template = document.querySelector('#incident-template');

function showMessage(text, kind = '') { message.textContent = text; message.className = `message ${kind}`; }
function detailLines(incident) {
  const factors = incident.priority_factors.map(f => `<li><b>${f.factor}</b>: +${f.points} — ${f.explanation}</li>`).join('');
  const duplicate = incident.duplicate_of
    ? `<p><b>Possible duplicate of #${incident.duplicate_of}</b> (explainable score ${incident.duplicate_score}).</p><ul>${incident.duplicate_evidence.map(e => `<li><b>${e.signal}</b>: ${e.explanation} (${e.value})</li>`).join('')}</ul>`
    : '<p>No likely duplicate found (threshold: 0.65).</p>';
  return `<p><b>Priority score: ${incident.priority_score}/100</b></p><ul>${factors}</ul>${duplicate}`;
}
function render(incidents) {
  list.innerHTML = '';
  incidents.forEach(incident => {
    const node = template.content.cloneNode(true); const card = node.querySelector('.incident');
    node.querySelector('.status').textContent = incident.status.replace('_', ' '); node.querySelector('.category').textContent = incident.category;
    node.querySelector('.title').textContent = `#${incident.id} ${incident.title}`; node.querySelector('.description').textContent = incident.description;
    node.querySelector('.meta').textContent = `${incident.location} · Reported by ${incident.reporter_name} · ${new Date(incident.created_at).toLocaleString()}`;
    node.querySelector('.priority').textContent = `Priority ${incident.priority_score}/100`; node.querySelector('.details-body').innerHTML = detailLines(incident);
    node.querySelector('.status-edit').value = incident.status; node.querySelector('.resolution').value = incident.resolution_note || '';
    node.querySelector('.save').addEventListener('click', async () => {
      const status = node.querySelector('.status-edit').value; const resolution_note = node.querySelector('.resolution').value;
      const response = await fetch(`/api/incidents/${incident.id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status, resolution_note}) });
      if (!response.ok) { alert((await response.json()).detail || 'Could not update incident'); return; } load();
    });
    list.appendChild(node);
  });
}
async function load() { const response = await fetch('/api/incidents'); render(await response.json()); }
form.addEventListener('submit', async event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(form)); data.severity = Number(data.severity);
  const response = await fetch('/api/incidents', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  if (!response.ok) { const body = await response.json(); showMessage(body.detail?.map?.(e => e.msg).join('; ') || body.detail || 'Please fix the form.', 'error'); return; }
  form.reset(); showMessage('Incident saved. Its score and duplicate reasoning are shown below.', 'success'); load();
});
document.querySelector('#refresh').addEventListener('click', load); load();
