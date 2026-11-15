const test=require('node:test');
const assert=require('node:assert/strict');

function orderBySequence(rows){
  return [...rows].sort((a,b)=>Number(a.sequence_no)-Number(b.sequence_no));
}

test('Persisted SPRO sequence_no controls sibling order independently of name',()=>{
  const rows=[
    {name:'Sales and Distribution',sequence_no:4},
    {name:'Financial Accounting',sequence_no:1},
    {name:'Human Resources Management',sequence_no:8},
    {name:'Controlling',sequence_no:2},
    {name:'Logistics - General',sequence_no:3},
    {name:'Materials Management',sequence_no:5},
    {name:'Logistics Execution',sequence_no:6},
    {name:'Plant Maintenance',sequence_no:7}
  ];
  assert.deepEqual(orderBySequence(rows).map(x=>x.name),[
    'Financial Accounting',
    'Controlling',
    'Logistics - General',
    'Sales and Distribution',
    'Materials Management',
    'Logistics Execution',
    'Plant Maintenance',
    'Human Resources Management'
  ]);
});
