const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const originalLoad=Module._load;
// The functions under test are exported by an Express route module. Keep this
// unit test dependency-free: routing itself is outside this data-fidelity test.
Module._load=function(request,parent,isMain){
  if(request==='express') return {Router:()=>({get(){},post(){}})};
  return originalLoad.call(this,request,parent,isMain);
};
const {group,validateAndTransform,cleanFields}=require('../server/routes/layers').__test;
Module._load=originalLoad;

test('Bronze collapses duplicate physical T001K rows without importing fields from later copies',()=>{
  const rows=[
    {TableName:'T001K',RecNumber:'0001',FieldName:'BWKEY',FieldValue:'1000'},
    {TableName:'T001K',RecNumber:'0002',FieldName:'BWKEY',FieldValue:'1000'},
    {TableName:'T001K',RecNumber:'0002',FieldName:'WERKS',FieldValue:'1000'}
  ];
  const bronze=group(rows,new Set(['T001K']),new Map([['T001K','T001K']]));
  assert.equal(bronze.length,1);
  assert.equal(bronze[0].sourceRecnumber,'0001');
  assert.deepEqual(bronze[0].sourceRecnumbers,['0001','0002']);
  assert.equal(bronze[0].fields.WERKS,undefined);
});

test('Silver and Gold exclude T001K-WERKS for the known target DDIC profile',()=>{
  const bronze=[{table:'T001K',recnumber:'0001',sourceRecnumber:'0001',fields:{BWKEY:'1000',WERKS:'1000'}}];
  const [silver]=validateAndTransform(bronze);
  assert.equal(silver.status,'warning');
  assert.equal(silver.fields.WERKS,undefined);
  assert.deepEqual(silver.excludedFields,[{field:'WERKS',reason:'FIELD_NOT_IN_TARGET_DDIC'}]);
  assert.deepEqual(cleanFields('T001K',{BWKEY:'1000',WERKS:'1000'}),{BWKEY:'1000'});
});
