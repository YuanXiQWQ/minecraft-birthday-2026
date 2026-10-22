/** Standalone diagnostic UI; imports only sibling experiment modules, never the formal game. */
import {TEXT as T} from './labels.mjs';
import {DEVICES, FACINGS, FIXED_SLOTS, PROTECTED, SIZE, SOURCES, key} from './core/definitions.mjs';
import {createState, demo, dispatch} from './core/model.mjs';
import {at} from './core/placement.mjs';
import {connections} from './core/flow.mjs';
import {loadState, saveState, STORAGE_KEY} from './core/persistence.mjs';

/** Transient UI selection never becomes a production save field. */
let state = demo('B'), selectedId = 'w2', layer = 0;

/** Create DOM without interpreting labels or loaded item data as HTML.
 * @param {string} tag Tag name.
 * @param {string} text Optional text content.
 * @param {object} attrs Element attributes.
 * @return {HTMLElement} New element.
 */
function element(tag, text = '', attrs = {}) {
  const node = document.createElement(tag);
  node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

/** Create a diagnostic command button.
 * @param {string} text Button label.
 * @param {Function} action Click callback.
 * @return {HTMLButtonElement} Button.
 */
function button(text, action) {
  const node = element('button', text);
  node.addEventListener('click', action);
  return node;
}

/** Construct a select from diagnostic identifiers.
 * @param {string[]} values Allowed values.
 * @param {string} label Accessible label.
 * @return {HTMLSelectElement} Selection input.
 */
function select(values, label) {
  const node = element('select', '', {'aria-label': label});
  for (const value of values) node.append(element('option', value, {value}));
  return node;
}

/** Pair text with a form control.
 * @param {string} text Label.
 * @param {HTMLElement} control Control.
 * @return {HTMLElement} Label element.
 */
function labelled(text, control) {
  const node = element('label', text);
  node.append(control);
  return node;
}

/** Show command/storage errors without changing the live state.
 * @param {string} text Diagnostic feedback.
 * @param {boolean} error Whether this is a rejection.
 */
function status(text, error = false) {
  statusBox.textContent = text;
  statusBox.dataset.kind = error ? 'error' : 'success';
}

/** Apply a transaction, retain the original state on rejection, then redraw.
 * @param {object} action Experiment command.
 */
function command(action) {
  try {
    state = dispatch(state, action);
    status(T.success);
    render();
  } catch (error) {
    status(error.message, true);
  }
}

/** Load an explicit debug fixture rather than adding real progression.
 * @param {string} mode A or B.
 * @param {string|null} cooker Optional sample demonstration cooker.
 * @param {string} fixture Fixture ID.
 */
function reset(mode, cooker = null, fixture = 'normal') {
  state = cooker ? demo(mode, cooker) : createState({mode, fixture});
  selectedId = cooker ? 'w2' : null;
  layer = 0;
  depth.value = '0';
  status(T.success);
  render();
}

/** Run the selected diagnostic interaction on a logical cell.
 * @param {number[]} pos Clicked logical position.
 */
function cellClicked(pos) {
  const occupant = at(state, pos);
  if (operation.value === 'Inspect') {
    selectedId = occupant?.id ?? null;
    if (occupant) facing.value = occupant.facing;
    render();
  } else if (operation.value === 'Remove') {
    if (occupant) command({type: 'remove', id: occupant.id});
    else status('missing-device', true);
  } else {
    const id = `w${state.nextId}`;
    command({type: 'place', device: device.value, pos, facing: facing.value, replace: replacement.checked});
    if (state.entities[id]) {
      selectedId = id;
      render();
    }
  }
}

/** Render a single depth layer and retain coordinates independently of pixels.
 */
function renderGrid() {
  grid.replaceChildren();
  for (let y = SIZE[1] - 1; y >= 0; y--) for (let x = 0; x < SIZE[0]; x++) {
    const pos = [x, y, layer], e = at(state, pos);
    const source = SOURCES.find(s => key(s.pos) === key(pos));
    const protectedCell = PROTECTED.find(p => key(p.pos) === key(pos));
    const guide = state.mode === 'A' && FIXED_SLOTS.find(s => key(s.pos) === key(pos));
    const description = e ? `${e.id} ${e.type}\n${e.facing}` : protectedCell
        ? `${T.protected}\n${protectedCell.id}` : source ? `${source.id}\n${state.resources[source.id] ? source.item : T.empty}` : guide ? T.guide : '';
    const cell = button(`${pos.join(',')}\n${description}`, () => cellClicked(pos));
    cell.className = `cell${e ? ' device' : ''}${e?.type === 'hopper' ? ' hopper' : ''}${source ? ' resource' : ''}${guide ? ' guide' : ''}${protectedCell ? ' protected' : ''}${e?.id === selectedId ? ' selected' : ''}`;
    cell.setAttribute('aria-label', `Cell ${pos.join(',')}${e ? ` ${e.id} ${e.type}` : ''}`);
    grid.append(cell);
  }
}

/** Render the same finite-slot inspector for either policy, including five-slot hoppers.
 */
function renderInspector() {
  inspector.replaceChildren();
  const e = state.entities[selectedId];
  if (!e) {
    inspector.append(element('p', T.noSelection));
    return;
  }
  inspector.append(element('h2', `${T.selected}: ${e.id} ${e.type} @ ${e.pos}`));
  inspector.append(element('p', T.slotHelp, {class: 'muted'}));
  const slots = element('div', '', {class: 'slots'});
  e.slots.forEach((stack, slot) => {
    const label = ['furnace', 'blast_furnace'].includes(e.type) ? [T.input, T.fuel, T.output][slot] : `#${slot + 1}`;
    const node = button(`${label}\n${stack ? `${stack.item} × ${stack.count}` : T.empty}`, () => command({
      type: 'click',
      id: e.id,
      slot
    }));
    node.addEventListener('contextmenu', event => {
      event.preventDefault();
      command({type: 'click', id: e.id, slot, half: true});
    });
    slots.append(node);
  });
  inspector.append(slots, button(T.quick, () => command({type: 'quick', id: e.id})),
      button(T.rotate, () => command({type: 'rotate', id: e.id, facing: facing.value})),
      element('h2', T.snapshot), element('pre', JSON.stringify(e, null, 2)));
}

/** Refresh diagnostics while preserving controls outside the redraw areas.
 */
function render() {
  title.textContent = `${T.title} · ${state.mode} · ${T.tick} ${state.tick}`;
  cursor.textContent = `${T.cursor}: ${state.cursor ? `${state.cursor.item} × ${state.cursor.count}` : T.empty}`;
  const previous = items.value;
  items.replaceChildren();
  for (const item of state.unlocked) items.append(element('option', item, {value: item}));
  if (state.unlocked.includes(previous)) items.value = previous;
  unlocks.textContent = `${T.unlocks}: ${state.unlocked.join(', ')}`;
  links.textContent = JSON.stringify(connections(state), null, 2);
  events.textContent = state.events.slice(-12).map(e => JSON.stringify(e)).join('\n');
  sourceList.replaceChildren();
  for (const source of SOURCES) {
    const row = element('div', `${source.id}: ${state.resources[source.id] ? source.item : T.empty} `, {class: 'source'});
    row.append(button(T.harvest, () => command({type: 'harvest', source: source.id, tool: tool.value || null})));
    sourceList.append(row);
  }
  renderGrid();
  renderInspector();
}

/** Save only to the experiment namespace and report storage failures explicitly.
 */
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, saveState(state));
    status(T.saved);
  } catch (error) {
    status(error.message, true);
  }
}

/** Restore before swapping the live state, so malformed data cannot replace it.
 */
function restore() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json === null) throw new Error(T.noSave);
    state = loadState(json);
    selectedId = Object.keys(state.entities)[0] ?? null;
    render();
    status(T.restored);
  } catch (error) {
    status(error.message, true);
  }
}

/** Diagnostic DOM references are local to this experiment. */
const app = document.getElementById('app'), title = element('h1'),
    statusBox = element('output', '', {id: 'status', 'aria-live': 'polite'});
const grid = element('div', '', {class: 'grid'}), inspector = element('section', '', {class: 'panel'});
const items = select([], T.catalogue),
    count = element('input', '', {type: 'number', min: 1, max: 64, value: 1, 'aria-label': T.count});
const operation = select(['Inspect', 'Place', 'Remove'], 'Operation'), device = select(Object.keys(DEVICES), T.device);
const facing = select(FACINGS, T.facing), depth = select(['0', '1'], T.layer);
const replacement = element('input', '', {type: 'checkbox'}),
    tool = select(['', 'wooden_pickaxe', 'stone_pickaxe'], 'Harvest tool');
const cursor = element('p'), unlocks = element('p', '', {class: 'muted'}), links = element('pre'),
    events = element('pre'), sourceList = element('div');
document.title = T.title;
facing.value = 'east';
device.addEventListener('change', () => {
  facing.value = device.value === 'hopper' ? 'down' : 'east';
});
depth.addEventListener('change', () => {
  layer = Number(depth.value);
  renderGrid();
});
const fixtures = element('div', '', {class: 'toolbar'});
fixtures.append(button(T.freshA, () => reset('A')), button(T.freshB, () => reset('B')),
    button(T.demoA, () => reset('A', 'furnace')), button(T.demoB, () => reset('B', 'furnace')),
    button(T.demoBlast, () => reset('B', 'blast_furnace')), button(T.tight, () => reset('B', null, 'tight')));
const controls = element('div', '', {class: 'toolbar'});
controls.append(labelled('Operation', operation), labelled(T.device, device), labelled(T.facing, facing),
    labelled(T.layer, depth), labelled(T.replace, replacement));
const steps = element('div', '', {class: 'toolbar'});
steps.append(button(T.step1, () => command({type: 'tick', count: 1})), button(T.step8, () => command({
      type: 'tick',
      count: 8
    })),
    button(T.step200, () => command({type: 'tick', count: 200})), button(T.revisit, () => command({type: 'revisit'})),
    button(T.save, save), button(T.restore, restore));
const catalogue = element('div', '', {class: 'toolbar'});
catalogue.append(labelled(T.catalogue, items), labelled(T.count, count), button(T.copy, () => command({
  type: 'catalogue',
  item: items.value,
  count: Number(count.value)
})), button(T.clear, () => command({type: 'clear-cursor'})));
const left = element('section', '', {class: 'panel'});
left.append(grid, element('h2', T.sources), labelled('Harvest tool', tool), sourceList);
const layout = element('div', '', {class: 'layout'});
layout.append(left, inspector);
app.append(title, element('p', T.warning, {class: 'warning'}), element('p', T.intro), fixtures, statusBox,
    controls, steps, catalogue, cursor, unlocks, layout, element('h2', T.links), links, element('h2', T.events), events);
status(T.success);
render();
