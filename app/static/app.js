const form = document.querySelector('#incident-form');
const formMessage = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-report');
const list = document.querySelector('#incidents');
const template = document.querySelector('#incident-template');
const search = document.querySelector('#search');
const statusFilter = document.querySelector('#status-filter');
const categoryFilter = document.querySelector('#category-filter');
const priorityFilter = document.querySelector('#priority-filter');
const queueSummary = document.querySelector('#queue-summary');
const refreshButton = document.querySelector('#refresh');
let incidents = [];
let loading = false;
const updating = new Set();

const transitions = {
  reported: ['reported', 'triaged'],
  triaged: ['triaged', 'in_progress'],
  in_progress: ['in_progress', 'resolved'],
  resolved: ['resolved', 'closed'],
  closed: ['closed'],
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showFormMessage(text, kind = '') {
  formMessage.textContent = text;
  formMessage.className = `message ${kind}`;
}

function apiError(body, fallback) {
  if (Array.isArray(body?.detail)) return body.detail.map(error => error.msg).join('; ');
  return body?.detail || fallback;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let body = null;
  try { body = await response.json(); } catch (_) { /* non-JSON error response */ }
  if (!response.ok) throw new Error(apiError(body, `Request failed (${response.status})`));
  return body;
}

function updateMetrics() {
  const active = incidents.filter(incident => !['resolved', 'closed'].includes(incident.status)).length;
  const high = incidents.filter(incident => incident.priority_score >= 70).length;
  const resolved = incidents.filter(incident => ['resolved', 'closed'].includes(incident.status)).length;
  document.querySelector('#metric-total').textContent = incidents.length;
  document.querySelector('#metric-active').textContent = active;
  document.querySelector('#metric-high').textContent = high;
  document.querySelector('#metric-resolved').textContent = resolved;
}

function filteredIncidents() {
  const query = search.value.trim().toLowerCase();
  const status = statusFilter.value;
  const category = categoryFilter.value.toLowerCase();
  const priority = priorityFilter.value;
  return incidents.filter(incident => {
    const haystack = [incident.id, incident.title, incident.description, incident.location, incident.reporter_name].join(' ').toLowerCase();
    const priorityMatch = !priority || (priority === 'high' && incident.priority_score >= 70) || (priority === 'medium' && incident.priority_score >= 40 && incident.priority_score < 70) || (priority === 'low' && incident.priority_score < 40);
    return (!query || haystack.includes(query)) && (!status || incident.status === status) && (!category || incident.category === category) && priorityMatch;
  });
}

function appendSignalList(parent, title, signals) {
  parent.appendChild(element('h4', null, title));
  if (!signals.length) { parent.appendChild(element('p', 'muted', 'None')); return; }
  const listNode = element('ul');
  signals.forEach(signal => {
    const item = element('li');
    item.append(element('b', null, signal.signal), ` — ${signal.explanation} (${signal.value})`);
    listNode.appendChild(item);
  });
  parent.appendChild(listNode);
}

function renderDetails(container, incident) {
  container.textContent = '';
  container.appendChild(element('p', null, `Priority score: ${incident.priority_score}/100`));
  appendSignalList(container, 'Priority factors', incident.priority_factors || []);
  const candidates = incident.duplicate_candidates || [];
  container.appendChild(element('h4', null, 'Duplicate review candidates'));
  if (!candidates.length) {
    container.appendChild(element('p', 'muted', 'No existing reports to compare.'));
  } else {
    candidates.forEach(candidate => {
      const candidateBlock = element('div', 'candidate');
      candidateBlock.appendChild(element('p', null, `Candidate #${candidate.candidate_incident_id} · heuristic score ${candidate.score}`));
      candidateBlock.appendChild(element('p', null, candidate.explanation));
      appendSignalList(candidateBlock, 'Matching signals', candidate.matching_signals || []);
      appendSignalList(candidateBlock, 'Conflicting signals', candidate.conflicting_signals || []);
      container.appendChild(candidateBlock);
    });
  }
  container.appendChild(element('h4', null, 'Status history'));
  const history = incident.status_history || [];
  if (!history.length) container.appendChild(element('p', 'muted', 'No status history recorded.'));
  else {
    const historyList = element('ul');
    history.forEach(entry => {
      const transition = entry.from_status ? `${entry.from_status} → ${entry.to_status}` : entry.to_status;
      const item = element('li', null, `${transition} · ${new Date(entry.changed_at).toLocaleString()}${entry.note ? ` · ${entry.note}` : ''}`);
      historyList.appendChild(item);
    });
    container.appendChild(historyList);
  }
  if (incident.resolution_note) container.appendChild(element('p', null, `Resolution note: ${incident.resolution_note}`));
}

function statusOptions(select, current) {
  select.textContent = '';
  (transitions[current] || [current]).forEach(status => select.appendChild(element('option', null, status)));
  select.value = current;
}

function render() {
  const visible = filteredIncidents();
  list.textContent = '';
  queueSummary.textContent = `${visible.length} of ${incidents.length} report${incidents.length === 1 ? '' : 's'} shown`;
  if (!visible.length) { list.appendChild(element('p', 'muted', incidents.length ? 'No incidents match these filters.' : 'No incidents reported yet.')); return; }
  visible.forEach(incident => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.incident');
    node.querySelector('.status').textContent = incident.status.replace('_', ' ');
    node.querySelector('.category').textContent = incident.category;
    node.querySelector('.title').textContent = `#${incident.id} ${incident.title}`;
    node.querySelector('.description').textContent = incident.description;
    node.querySelector('.meta').textContent = `${incident.location} · Reported by ${incident.reporter_name} · ${new Date(incident.created_at).toLocaleString()}`;
    node.querySelector('.priority').textContent = `Priority ${incident.priority_score}/100`;
    renderDetails(node.querySelector('.details-body'), incident);
    const statusEdit = node.querySelector('.status-edit');
    const resolution = node.querySelector('.resolution');
    const save = node.querySelector('.save');
    statusOptions(statusEdit, incident.status);
    resolution.value = incident.resolution_note || '';
    const busy = updating.has(incident.id);
    statusEdit.disabled = busy; resolution.disabled = busy; save.disabled = busy;
    save.textContent = busy ? 'Saving…' : 'Update';
    save.addEventListener('click', () => updateIncident(incident, statusEdit.value, resolution.value, save, statusEdit, resolution));
    list.appendChild(node);
  });
}

async function loadIncidents(showLoading = true) {
  if (showLoading) { loading = true; list.textContent = ''; list.appendChild(element('p', 'muted', 'Loading incidents…')); refreshButton.disabled = true; }
  try {
    incidents = await requestJson('/api/incidents');
    updateMetrics();
    render();
  } catch (error) {
    list.textContent = '';
    list.appendChild(element('p', 'message error', `Could not load incidents: ${error.message}`));
    queueSummary.textContent = '';
  } finally { loading = false; refreshButton.disabled = false; }
}

async function updateIncident(incident, status, resolutionNote, save, statusEdit, resolution) {
  if (updating.has(incident.id)) return;
  updating.add(incident.id); save.disabled = true; statusEdit.disabled = true; resolution.disabled = true; save.textContent = 'Saving…';
  try {
    await requestJson(`/api/incidents/${incident.id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status, resolution_note: resolutionNote}) });
    await loadIncidents(false);
    showFormMessage(`Incident #${incident.id} updated.`, 'success');
  } catch (error) {
    showFormMessage(`Could not update incident: ${error.message}`, 'error');
    updating.delete(incident.id); render();
  } finally { updating.delete(incident.id); }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (loading || submitButton.disabled) return;
  submitButton.disabled = true; submitButton.textContent = 'Submitting…'; form.setAttribute('aria-busy', 'true');
  const data = Object.fromEntries(new FormData(form)); data.severity = Number(data.severity);
  try {
    await requestJson('/api/incidents', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
    form.reset();
    showFormMessage('Incident saved. Its score and duplicate reasoning are shown below.', 'success');
    await loadIncidents(false);
  } catch (error) {
    showFormMessage(`Could not save incident: ${error.message}`, 'error');
  } finally { submitButton.disabled = false; submitButton.textContent = 'Submit report'; form.removeAttribute('aria-busy'); }
});

[search, statusFilter, categoryFilter, priorityFilter].forEach(control => control.addEventListener('input', render));
refreshButton.addEventListener('click', () => loadIncidents(true));
loadIncidents(true);
