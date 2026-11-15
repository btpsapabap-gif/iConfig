const test=require('node:test');
const assert=require('node:assert/strict');
const {compareDeployments,hashDeployment}=require('../server/deploymentVersioning');

const payload=(value)=>({DeployTableSet:[{Tablename:'T001',DeployRowSet:[{Recnumber:'1',DeployFieldSet:[
  {Name:'BUKRS',Value:'5001000'},{Name:'BUTXT',Value:value}
]}]}]});

test('deployment comparison detects identical payload field-by-field',()=>{
  const d=compareDeployments(payload('Company'),payload('Company'));
  assert.equal(d.unchanged,true);
  assert.equal(d.changedFieldCount,0);
});

test('deployment comparison detects added, removed and changed fields',()=>{
  const before={DeployTableSet:[{Tablename:'T001',DeployRowSet:[{Recnumber:'1',DeployFieldSet:[{Name:'BUKRS',Value:'5001000'},{Name:'BUTXT',Value:'Old'}]}]}]};
  const after={DeployTableSet:[{Tablename:'T001',DeployRowSet:[{Recnumber:'1',DeployFieldSet:[{Name:'BUKRS',Value:'5001000'},{Name:'BUTXT',Value:'New'},{Name:'LAND1',Value:'IN'}]}]}]};
  const d=compareDeployments(before,after);
  assert.equal(d.unchanged,false);
  assert.equal(d.changedFieldCount,2);
  assert.deepEqual(d.changed[0],{table:'T001',recnumber:'1',field:'BUTXT',before:'Old',after:'New'});
  assert.deepEqual(d.added[0],{table:'T001',recnumber:'1',field:'LAND1',before:null,after:'IN'});
});

test('deployment hash is stable for field ordering',()=>{
  const a={DeployTableSet:[{Tablename:'T001',DeployRowSet:[{Recnumber:'1',DeployFieldSet:[{Name:'Z',Value:'2'},{Name:'A',Value:'1'}]}]}]};
  const b={DeployTableSet:[{Tablename:'T001',DeployRowSet:[{Recnumber:'1',DeployFieldSet:[{Name:'A',Value:'1'},{Name:'Z',Value:'2'}]}]}]};
  assert.equal(hashDeployment(a),hashDeployment(b));
});
