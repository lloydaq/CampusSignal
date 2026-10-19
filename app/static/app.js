const form = document.querySelector('#incident-form');
const formMessage = document.querySelector('#form-message');
const submitButton = document.querySelector('#submit-report');
const list = document.querySelector('#incidents');
const detailPanel = document.querySelector('#detail-panel');
const search = document.querySelector('#search');
const statusFilter = document.querySelector('#status-filter');
const categoryFilter = document.querySelector('#category-filter');
const priorityFilter = document.querySelector('#priority-filter');
const clearFiltersButton = document.querySelector('#clear-filters');
const queueSummary = document.querySelector('#queue-summary');
const queueCount = document.querySelector('#queue-count');
const refreshButton = document.querySelector('#refresh');
const announcer = document.querySelector('#live-announcer');
const sidebar = document.querySelector('.sidebar');
const mobileMenu = document.querySelector('#mobile-menu');
const stages = ['reported', 'triaged', 'in_progress', 'resolved', 'closed'];
const updating = new Set();
let incidents = [];
let selectedId = null;
let loading = false;

const transitions = {
  reported: ['reported', 'triaged'],
  triaged: ['triaged', 'in_progress'],
  in_progress: ['in_progress', 'resolved'],
  resolved: ['resolved', 'closed'],
  closed: ['closed'],
};

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function formatStatus(status) { return status.replace('_', ' '); }
function formatDate(value) { return value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable'; }
function announce(text) { announcer.textContent = ''; window.setTimeout(() => { announcer.textContent = text; }, 10); }
function showFormMessage(text, kind = '') { formMessage.textContent = text; formMessage.className = `form-message ${kind}`; }
function showInlineMessage(parent, text, kind = '') { const message = make('p', `inline-message ${kind}`, text); parent.appendChild(message); return message; }

function apiError(body, fallback) {
  if (Array.isArray(body?.detail)) return body.detail.map(error => error.msg).join('; ');
  return body?.detail || fallback;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let body = null;
  try { body = await response.json(); } catch (_) { /* The server may return an empty error body. */ }
  if (!response.ok) throw new Error(apiError(body, `Request failed (${response.status})`));
  return body;
}

function updateMetrics() {
  const active = incidents.filter(incident => !['resolved', 'closed'].includes(incident.status)).length;
  const high = incidents.filter(incident => incident.priority_score >= 70).length;
  const resolved = incidents.filter(incident => ['resolved', 'closed'].includes(incident.status)).length;
  document.querySelector('#metric-active').textContent = active;
  document.querySelector('#metric-total').textContent = incidents.length;
  document.querySelector('#metric-high').textContent = high;
  document.querySelector('#metric-resolved').textContent = resolved;
}

function hasFilters() { return Boolean(search.value.trim() || statusFilter.value || categoryFilter.value || priorityFilter.value); }

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

function priorityClass(score) { return score >= 70 ? 'priority-high' : score >= 40 ? 'priority-medium' : 'priority-low'; }

function renderMetricsAndSummary(visible) {
  updateMetrics();
  queueSummary.textContent = `${visible.length} of ${incidents.length} report${incidents.length === 1 ? '' : 's'} shown`;
  queueCount.textContent = visible.length;
  clearFiltersButton.hidden = !hasFilters();
}

function appendBadge(parent, className, text, status) {
  const badge = make('span', className, text);
  if (status) badge.dataset.status = status;
  parent.appendChild(badge);
  return badge;
}

function renderQueue() {
  if (loading) return;
  const visible = filteredIncidents();
  renderMetricsAndSummary(visible);
  list.textContent = '';
  if (!visible.length) {
    const empty = make('div', 'empty-state');
    const title = incidents.length ? 'No matching signals' : 'Your queue is clear';
    const copy = incidents.length ? 'Try another search or remove a filter to see more reports.' : 'No incidents have been reported yet. Be the first to raise a signal.';
    empty.appendChild(make('strong', null, title));
    empty.appendChild(make('p', null, copy));
    const action = make('button', 'button button-secondary', incidents.length ? 'Clear filters' : 'Report the first incident');
    action.type = 'button';
    action.addEventListener('click', incidents.length ? clearFilters : scrollToReport);
    empty.appendChild(action);
    list.appendChild(empty);
    return;
  }
  visible.forEach(incident => {
    const row = make('button', `queue-row${incident.id === selectedId ? ' is-selected' : ''}`);
    row.type = 'button';
    row.setAttribute('aria-pressed', incident.id === selectedId ? 'true' : 'false');
    row.addEventListener('click', () => selectIncident(incident.id));
    const main = make('span', 'queue-main');
    const titleLine = make('span', 'queue-title-line');
    titleLine.appendChild(make('span', 'queue-id', `#${incident.id}`));
    titleLine.appendChild(make('span', 'queue-title', incident.title || 'Untitled incident'));
    main.appendChild(titleLine);
    const meta = make('span', 'queue-meta');
    appendBadge(meta, 'status-badge', formatStatus(incident.status), incident.status);
    appendBadge(meta, 'category-badge', incident.category || 'Uncategorized');
    meta.appendChild(make('span', null, incident.location || 'Location unavailable'));
    meta.appendChild(make('span', null, formatDate(incident.created_at)));
    if (incident.duplicate_candidates?.length) appendBadge(meta, 'duplicate-flag', `◌ ${incident.duplicate_candidates.length} review candidate${incident.duplicate_candidates.length === 1 ? '' : 's'}`);
    main.appendChild(meta);
    row.appendChild(main);
    const priority = make('span', `queue-priority ${priorityClass(incident.priority_score)}`);
    priority.appendChild(make('strong', null, String(incident.priority_score)));
    priority.appendChild(make('span', null, 'PRIORITY'));
    row.appendChild(priority);
    list.appendChild(row);
  });
}

function appendSignalList(parent, title, signals, conflict = false) {
  const group = make('div', `signal-group${conflict ? ' conflicts' : ''}`);
  group.appendChild(make('h4', null, title));
  if (!signals?.length) { group.appendChild(make('p', 'trail-fallback', 'None recorded.')); parent.appendChild(group); return; }
  const signalList = make('ul');
  signals.forEach(signal => {
    const item = make('li');
    item.appendChild(make('b', null, signal.signal || 'Signal'));
    item.appendChild(document.createTextNode(` — ${signal.explanation || 'No explanation available'} (${signal.value ?? 'n/a'})`));
    signalList.appendChild(item);
  });
  group.appendChild(signalList);
  parent.appendChild(group);
}

function renderSignalTrail(parent, incident) {
  const trail = make('div', 'signal-trail');
  const history = Array.isArray(incident.status_history) ? incident.status_history : [];
  const historyByStatus = new Map();
  history.forEach(entry => historyByStatus.set(entry.to_status, entry));
  const currentIndex = stages.indexOf(incident.status);
  stages.forEach((stage, index) => {
    const entry = historyByStatus.get(stage);
    const stageNode = make('div', `trail-stage ${index < currentIndex ? 'is-complete' : index === currentIndex ? 'is-current' : 'is-future'}`);
    stageNode.appendChild(make('span', 'trail-marker', index < currentIndex ? '✓' : index === currentIndex ? '·' : ''));
    const copy = make('span', 'trail-copy');
    copy.appendChild(make('strong', null, formatStatus(stage)));
    if (entry) copy.appendChild(make('small', null, formatDate(entry.changed_at)));
    stageNode.appendChild(copy);
    trail.appendChild(stageNode);
  });
  if (!history.length) trail.appendChild(make('p', 'trail-fallback', 'No persisted status history is available for this incident.'));
  parent.appendChild(trail);
}

function renderFactors(parent, incident) {
  const factorList = make('ul', 'factor-list');
  (incident.priority_factors || []).forEach(factor => {
    const item = make('li');
    item.appendChild(make('span', 'factor-name', factor.factor || 'Factor'));
    item.appendChild(make('span', 'factor-explanation', factor.explanation || 'No explanation available.'));
    item.appendChild(make('span', 'factor-points', `+${factor.points ?? 0}`));
    factorList.appendChild(item);
  });
  if (!factorList.children.length) factorList.appendChild(make('li', 'trail-fallback', 'No priority factors recorded.'));
  parent.appendChild(factorList);
}

function appendDuplicateCandidates(parent, incident) {
  const candidates = incident.duplicate_candidates || [];
  if (!candidates.length) { parent.appendChild(make('p', 'trail-fallback', 'No existing reports to compare.')); return; }
  candidates.forEach(candidate => {
    const block = make('div', 'candidate');
    const summary = make('div', 'candidate-summary');
    summary.appendChild(make('strong', null, `Candidate #${candidate.candidate_incident_id}`));
    summary.appendChild(make('span', 'candidate-score', `Heuristic score ${candidate.score}`));
    block.appendChild(summary);
    block.appendChild(make('p', 'candidate-explanation', candidate.explanation || 'No explanation available.'));
    appendSignalList(block, 'Matching signals', candidate.matching_signals || []);
    appendSignalList(block, 'Conflicting signals', candidate.conflicting_signals || [], true);
    parent.appendChild(block);
  });
}

function buildStatusSelect(current) {
  const select = make('select');
  select.id = 'detail-status';
  select.setAttribute('aria-label', 'New incident status');
  (transitions[current] || [current]).forEach(status => select.appendChild(make('option', null, formatStatus(status))));
  select.querySelectorAll('option').forEach((option, index) => { option.value = (transitions[current] || [current])[index]; });
  select.value = current;
  return select;
}

function renderDetail(incident) {
  detailPanel.textContent = '';
  if (!incident) {
    const placeholder = make('div', 'detail-placeholder');
    placeholder.appendChild(make('span', 'placeholder-mark', '◎'));
    placeholder.appendChild(make('h2', null, 'Select an incident'));
    placeholder.appendChild(make('p', null, 'Choose a report from the queue to inspect its signal trail, priority reasoning, and next action.'));
    detailPanel.appendChild(placeholder);
    return;
  }
  const content = make('div', 'detail-content');
  const header = make('header', 'detail-header');
  const headerTop = make('div', 'detail-header-top');
  headerTop.appendChild(make('span', 'detail-id', `INCIDENT #${incident.id}`));
  appendBadge(headerTop, 'status-badge', formatStatus(incident.status), incident.status);
  header.appendChild(headerTop);
  header.appendChild(make('h2', 'detail-title', incident.title || 'Untitled incident'));
  header.appendChild(make('p', 'detail-description', incident.description || 'No description recorded.'));
  const meta = make('div', 'detail-meta');
  meta.appendChild(make('span', null, `⌖ ${incident.location || 'Location unavailable'}`));
  meta.appendChild(make('span', null, `Reported by ${incident.reporter_name || 'Unknown reporter'}`));
  meta.appendChild(make('span', null, formatDate(incident.created_at)));
  header.appendChild(meta);
  content.appendChild(header);

  const prioritySection = make('section', 'detail-section');
  prioritySection.appendChild(make('h3', null, 'Priority intelligence'));
  const scoreLine = make('div', 'score-line');
  const score = make('div', 'score-number'); score.appendChild(document.createTextNode(String(incident.priority_score ?? '—'))); score.appendChild(make('small', null, '/ 100')); scoreLine.appendChild(score);
  scoreLine.appendChild(make('span', 'severity-label', `Severity ${incident.severity ?? '—'} / 5`));
  prioritySection.appendChild(scoreLine); renderFactors(prioritySection, incident); content.appendChild(prioritySection);

  const duplicateSection = make('section', 'detail-section');
  duplicateSection.appendChild(make('h3', null, 'Duplicate intelligence · review only'));
  if (incident.duplicate_of) duplicateSection.appendChild(make('p', 'candidate-explanation', `Suggested duplicate of #${incident.duplicate_of}. Original reports remain separate; confirm only after human review.`));
  else duplicateSection.appendChild(make('p', 'candidate-explanation', 'No candidate crossed the duplicate-review threshold.'));
  appendDuplicateCandidates(duplicateSection, incident); content.appendChild(duplicateSection);

  const trailSection = make('section', 'detail-section');
  trailSection.appendChild(make('h3', null, 'Signal Trail · persisted workflow'));
  renderSignalTrail(trailSection, incident); content.appendChild(trailSection);

  const workflowSection = make('section', 'detail-section');
  workflowSection.appendChild(make('h3', null, 'Update workflow'));
  const controls = make('div', 'workflow-controls');
  const statusLabel = make('label', null, 'Next status'); statusLabel.appendChild(buildStatusSelect(incident.status)); controls.appendChild(statusLabel);
  const noteLabel = make('label', null, 'Resolution note'); const note = make('input'); note.id = 'detail-resolution'; note.placeholder = 'Required when resolving'; note.value = incident.resolution_note || ''; noteLabel.appendChild(note); controls.appendChild(noteLabel);
  const updateButton = make('button', 'button button-primary', 'Save update'); updateButton.type = 'button'; controls.appendChild(updateButton);
  workflowSection.appendChild(controls);
  if (incident.resolution_note) { const resolution = make('div', 'resolution-view'); resolution.appendChild(make('strong', null, 'Resolution note')); resolution.appendChild(document.createTextNode(incident.resolution_note)); workflowSection.appendChild(resolution); }
  updateButton.addEventListener('click', () => updateIncident(incident, controls, updateButton));
  content.appendChild(workflowSection);
  detailPanel.appendChild(content);
}

function renderSelectedDetail() { renderDetail(incidents.find(incident => incident.id === selectedId)); }

function selectIncident(id) { selectedId = id; renderQueue(); renderSelectedDetail(); }

function clearFilters() { search.value = ''; statusFilter.value = ''; categoryFilter.value = ''; priorityFilter.value = ''; renderQueue(); announce('Filters cleared.'); }

function scrollToReport() { document.querySelector('#report').scrollIntoView({ behavior: 'smooth', block: 'start' }); window.setTimeout(() => document.querySelector('#title').focus(), 350); }

async function loadIncidents(showLoading = true) {
  if (showLoading) { loading = true; list.textContent = ''; list.appendChild(make('div', 'loading-state')).appendChild(make('span', 'spinner')); list.querySelector('.loading-state').appendChild(make('span', null, 'Loading incident signals…')); refreshButton.disabled = true; }
  try {
    incidents = await requestJson('/api/incidents');
    if (selectedId === null || !incidents.some(incident => incident.id === selectedId)) selectedId = incidents[0]?.id ?? null;
    loading = false; updateMetrics(); renderQueue(); renderSelectedDetail();
  } catch (error) {
    list.textContent = '';
    const failure = make('div', 'empty-state'); failure.appendChild(make('strong', null, 'Signal desk unavailable')); failure.appendChild(make('p', null, `We could not load incidents: ${error.message}`)); const retry = make('button', 'button button-secondary', 'Try again'); retry.type = 'button'; retry.addEventListener('click', () => loadIncidents(true)); failure.appendChild(retry); list.appendChild(failure); queueSummary.textContent = 'Unable to load reports'; queueCount.textContent = '—';
  } finally { loading = false; refreshButton.disabled = false; }
}

async function updateIncident(incident, controls, updateButton) {
  if (updating.has(incident.id)) return;
  const status = controls.querySelector('#detail-status').value;
  const resolutionNote = controls.querySelector('#detail-resolution').value;
  updating.add(incident.id); updateButton.disabled = true; updateButton.textContent = 'Saving…';
  let message;
  try {
    await requestJson(`/api/incidents/${incident.id}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ status, resolution_note: resolutionNote }) });
    await loadIncidents(false);
    message = `Incident #${incident.id} updated to ${formatStatus(status)}.`;
    announce(message); showFormMessage(message, 'success');
  } catch (error) {
    message = `Update not confirmed: ${error.message}`;
    showInlineMessage(controls.parentElement, message, 'error'); announce(message);
    updateButton.disabled = false; updateButton.textContent = 'Save update';
  } finally { updating.delete(incident.id); }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (loading || submitButton.disabled) return;
  submitButton.disabled = true; submitButton.textContent = 'Submitting…'; form.setAttribute('aria-busy', 'true');
  const data = Object.fromEntries(new FormData(form)); data.severity = Number(data.severity);
  try {
    const created = await requestJson('/api/incidents', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    form.reset(); selectedId = created.id; showFormMessage('Report received. Your signal is now in the live queue.', 'success'); announce(`Incident #${created.id} submitted successfully.`); await loadIncidents(false);
  } catch (error) { showFormMessage(`Could not save incident: ${error.message}`, 'error'); announce(`Incident submission failed: ${error.message}`); }
  finally { submitButton.disabled = false; submitButton.textContent = '↗  Submit report'; form.removeAttribute('aria-busy'); }
});

[search, statusFilter, categoryFilter, priorityFilter].forEach(control => control.addEventListener('input', renderQueue));
clearFiltersButton.addEventListener('click', clearFilters);
refreshButton.addEventListener('click', () => loadIncidents(true));
document.querySelector('#header-report').addEventListener('click', scrollToReport);
document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', () => { sidebar.classList.remove('is-open'); mobileMenu.setAttribute('aria-expanded', 'false'); }));
mobileMenu.addEventListener('click', () => { const open = sidebar.classList.toggle('is-open'); mobileMenu.setAttribute('aria-expanded', String(open)); });
document.querySelector('#current-date').textContent = new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
loadIncidents(true);
