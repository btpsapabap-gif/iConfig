// Canonical iConfigPro SPRO module catalog and compatibility aliases.
// module_code is the stable relationship key; module_name is display text.
const CATALOG = [
  ['ER', 'Enterprise Structure'],
  ['FI', 'Financial Accounting (New)'],
  ['CO', 'Controlling'],
  ['LG', 'Logistics - General'],
  ['SD', 'Sales and Distribution'],
  ['MM', 'Materials Management'],
  ['LE', 'Logistics Execution'],
  ['QM', 'Quality Management'],
  ['PD', 'Production'],
  ['PP', 'Production Planning for Process Industries'],
  ['PS', 'Project System'],
  ['TM', 'Time Management'],
  ['PY', 'Payroll'],
  ['PM', 'Personnel Management']
].map(([code, name], display_order) => ({ code, name, display_order: display_order + 1 }));

const BY_CODE = new Map(CATALOG.map(x => [x.code, x]));
const BY_NAME = new Map(CATALOG.map(x => [x.name.toUpperCase(), x]));

// Existing SPRO hierarchy/cache data uses some older SAP IMG labels.
const ALIASES = new Map([
  ['FINANCIAL ACCOUNTING', 'FI'],
  ['FINANCIAL ACCOUNTING (NEW)', 'FI'],
  ['WAREHOUSE / LOGISTICS EXECUTION', 'LE'],
  ['WAREHOUSE/LOGISTICS EXECUTION', 'LE'],
  ['LOGISTICS EXECUTION', 'LE'],
  ['PRODUCTION PLANNING', 'PP'],
  ['PRODUCTION PLANNING FOR PROCESS INDUSTRIES', 'PP']
]);

function normalize(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function codeFor(value) {
  const raw = normalize(value);
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (BY_CODE.has(upper)) return upper;
  const byName = BY_NAME.get(upper);
  if (byName) return byName.code;
  return ALIASES.get(upper) || '';
}

function definitionFor(value) {
  const code = codeFor(value);
  return BY_CODE.get(code) || null;
}

function hierarchyAliasesFor(codeOrName) {
  const def = definitionFor(codeOrName);
  if (!def) return [];
  const names = [def.name];
  for (const [alias, aliasCode] of ALIASES.entries()) {
    if (aliasCode === def.code && !names.includes(alias)) names.push(alias);
  }
  return names;
}

module.exports = { CATALOG, codeFor, definitionFor, hierarchyAliasesFor, normalize };
