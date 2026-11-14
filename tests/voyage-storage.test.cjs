const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('voyage/store.js', 'utf8');

async function store(options = {}) {
  const context = vm.createContext({
    window: { VOYAGE_CONFIG: options.config || {} },
    location: { hostname: options.hostname || 'madison-davis.github.io' },
    AbortSignal,
    fetch: options.fetch || (() => { throw Error('Unexpected local API request'); }),
    sdk: { createClient: () => options.client },
  });
  vm.runInContext(source.replace(/await import\('[^']+'\)/, 'sdk'), context);
  return context.window.voyageStoreReady;
}
const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' };
function client({ signedIn = true, writeError = null } = {}) {
  const state = { rows: [], owners: [] };
  return {
    state,
    auth: {
      getUser: async () => ({ data: { user: signedIn ? { id: 'owner-1' } : null } }),
      getSession: async () => ({ data: { session: signedIn ? { user: { id: 'owner-1' } } : null } }),
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
    from(table) {
      assert.equal(table, 'voyage_places');
      return {
        select() {
          return { eq: async (column, owner) => {
            assert.equal(column, 'owner_id');
            state.owners.push(owner);
            return { data: state.rows.map((row) => ({ place: row.place })), error: null };
          } };
        },
        async upsert(rows, options) {
          assert.equal(options.onConflict, 'owner_id,id');
          if (!writeError) state.rows = rows;
          return { error: writeError };
        },
      };
    },
  };
}

test('GitHub Pages never falls back to a nonexistent local save API', async () => {
  const adapter = await store();
  assert.equal(adapter.mode, 'unconfigured');
  assert.throws(() => adapter.load(), /Cloud storage is not connected/);
});
test('cloud saves belong to the authenticated user and reload from cloud', async () => {
  const api = client();
  const adapter = await store({ config, client: api });
  const place = { id: 'place-1', title: 'Coffee' };
  const result = await adapter.save([place]);
  assert.equal(result[0].title, 'Coffee');
  assert.equal(api.state.rows[0].owner_id, 'owner-1');
  assert.equal(api.state.owners[0], 'owner-1');
});
test('signed-out visitors cannot load or write personal places', async () => {
  const adapter = await store({ config, client: client({ signedIn: false }) });
  await assert.rejects(adapter.load(), /Sign in/);
  await assert.rejects(adapter.save([{ id: 'place-1' }]), /Sign in/);
});
test('database write failures are surfaced instead of reporting saved', async () => {
  const adapter = await store({ config, client: client({ writeError: { message: 'Permission denied' } }) });
  await assert.rejects(adapter.save([{ id: 'place-1' }]), /Permission denied/);
});
test('unconfigured local development still uses the file-saving server', async () => {
  const calls = [];
  const adapter = await store({ hostname: '127.0.0.1', fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ places: [] }) };
  } });
  await adapter.load();
  await adapter.save([]);
  assert.equal(calls[0].url, '/api/voyage/places');
  assert.equal(calls[1].options.method, 'POST');
});
test('browser migration clears data only after a successful cloud save', async () => {
  const app = fs.readFileSync('app.js', 'utf8');
  const functions = app.slice(app.indexOf('async function persistEvents('), app.indexOf('function loadWorkoutLogs('));
  for (const fail of [false, true]) {
    let removed = false;
    const old = { id: 'old-place', title: 'Existing place' };
    const context = vm.createContext({
      events: [], seedEvents: [], STORAGE_KEY: 'legacy',
      normalizeEvent: (place) => place,
      renderEvents() {}, $: () => ({}), console: { warn() {} },
      localStorage: { getItem: () => JSON.stringify([old]), removeItem() { removed = true; } },
      window: { voyageStoreReady: Promise.resolve({
        mode: 'cloud', session: async () => ({}), load: async () => [],
        save: async (places) => { if (fail) throw Error('Offline'); return places; },
      }) },
    });
    await vm.runInContext(functions + '\nloadVoyagePlaces()', context);
    assert.equal(removed, !fail);
  }
});
