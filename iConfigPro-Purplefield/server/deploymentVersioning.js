const crypto = require('crypto');

function clean(value) {
  return String(value ?? '').trim();
}

function canonicalPayload(payload) {
  const tables = Array.isArray(payload?.DeployTableSet) ? payload.DeployTableSet : [];
  return tables
    .map(table => ({
      Tablename: clean(table?.Tablename).toUpperCase(),
      Viewname: clean(table?.Viewname).toUpperCase(),
      DeployRowSet: (Array.isArray(table?.DeployRowSet) ? table.DeployRowSet : [])
        .map(row => ({
          Recnumber: clean(row?.Recnumber),
          DeployFieldSet: (Array.isArray(row?.DeployFieldSet) ? row.DeployFieldSet : [])
            .map(field => ({
              Name: clean(field?.Name).toUpperCase(),
              Value: String(field?.Value ?? '')
            }))
            .sort((a,b) => a.Name.localeCompare(b.Name) || a.Value.localeCompare(b.Value))
        }))
        .sort((a,b) => a.Recnumber.localeCompare(b.Recnumber))
    }))
    .sort((a,b) => a.Tablename.localeCompare(b.Tablename));
}

function fieldMap(payload) {
  const map = new Map();
  for (const table of canonicalPayload(payload)) {
    for (const row of table.DeployRowSet) {
      for (const field of row.DeployFieldSet) {
        map.set(`${table.Tablename}|${row.Recnumber}|${field.Name}`, field.Value);
      }
    }
  }
  return map;
}

function compareDeployments(previousPayload, currentPayload) {
  const previous = fieldMap(previousPayload);
  const current = fieldMap(currentPayload);
  const added = [], removed = [], changed = [];
  const keys = new Set([...previous.keys(), ...current.keys()]);
  for (const key of [...keys].sort()) {
    const before = previous.get(key);
    const after = current.get(key);
    if (before === undefined) {
      const [table, recnumber, field] = key.split('|');
      added.push({table, recnumber, field, before: null, after});
    } else if (after === undefined) {
      const [table, recnumber, field] = key.split('|');
      removed.push({table, recnumber, field, before, after: null});
    } else if (before !== after) {
      const [table, recnumber, field] = key.split('|');
      changed.push({table, recnumber, field, before, after});
    }
  }
  return {
    unchanged: added.length === 0 && removed.length === 0 && changed.length === 0,
    added, removed, changed,
    changedFieldCount: added.length + removed.length + changed.length
  };
}

function hashDeployment(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload(payload))).digest('hex');
}

module.exports = { canonicalPayload, fieldMap, compareDeployments, hashDeployment };
