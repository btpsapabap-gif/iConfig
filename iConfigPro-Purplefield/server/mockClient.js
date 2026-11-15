const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '..', 'data', 'mockTarget.json');

function sampleRows() {
  return [
    { BCSetID:'DEMO_E2E', TableName:'T001', RecNumber:'0001', FieldName:'MANDT', FieldValue:'110', RawTableKey:'110|0001', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T001', RecNumber:'0001', FieldName:'BUKRS', FieldValue:'1000', RawTableKey:'110|1000', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T001', RecNumber:'0001', FieldName:'BUTXT', FieldValue:'Demo Company Code', RawTableKey:'110|1000', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T001W', RecNumber:'0001', FieldName:'MANDT', FieldValue:'110', RawTableKey:'110|1000', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T001W', RecNumber:'0001', FieldName:'WERKS', FieldValue:'1000', RawTableKey:'110|1000', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T001W', RecNumber:'0001', FieldName:'NAME1', FieldValue:'Demo Plant', RawTableKey:'110|1000', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T024E', RecNumber:'0001', FieldName:'MANDT', FieldValue:'110', RawTableKey:'110|1000', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T024E', RecNumber:'0001', FieldName:'EKORG', FieldValue:'1000', RawTableKey:'110|1000', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T024E', RecNumber:'0001', FieldName:'EKOTX', FieldValue:'Demo Purchasing Org', RawTableKey:'110|1000', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T006', RecNumber:'0001', FieldName:'MANDT', FieldValue:'110', RawTableKey:'110|EA', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T006', RecNumber:'0001', FieldName:'MSEHI', FieldValue:'EA', RawTableKey:'110|EA', Client:'110', Status:'A' },
    { BCSetID:'DEMO_E2E', TableName:'T006', RecNumber:'0001', FieldName:'MSEHL', FieldValue:'Each', RawTableKey:'110|EA', Client:'110', Status:'A' }
  ];
}

function ensureStore() {
  if (!fs.existsSync(storePath)) fs.writeFileSync(storePath, JSON.stringify({ deployments: [] }, null, 2));
}

function listBcSets() { return [{ id:'DEMO_E2E', name:'Demo E2E BC Set' }]; }
function loadRows(bcsetId='DEMO_E2E') { return sampleRows().filter(r => r.BCSetID === bcsetId); }

function deploy(payload) {
  ensureStore();
  const current = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const id = `MOCK-${Date.now()}`;
  const record = { id, receivedAt:new Date().toISOString(), status: payload.Activate === 'true' ? 'ACTIVATED' : 'STAGED', ...payload };
  current.deployments.push(record);
  fs.writeFileSync(storePath, JSON.stringify(current, null, 2));
  return { DeploymentId:id, Status:record.status, TargetCli:payload.TargetCli, TableCount:payload.DeployTableSet.length };
}

module.exports = { listBcSets, loadRows, deploy, storePath };
