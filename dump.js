const fs = require('fs');
const MDBReader = require('mdb-reader').default;

const buf = fs.readFileSync('SYS-RDG-006-2.accdb');
const reader = new MDBReader(buf);

const out = {
  tables: reader.getTableNames()
};

// Try getting output_flange
const flangeName = out.tables.find(t => t.toLowerCase() === 'output_flange');
if (flangeName) {
  const t = reader.getTable(flangeName);
  out.output_flange_cols = t.getColumnNames();
  out.output_flange_data = t.getData().slice(0, 3);
}

// Try finding jobname
const jobTabs = [];
for (const tbl of out.tables) {
  try {
    const t = reader.getTable(tbl);
    const cols = t.getColumnNames();
    if (cols.some(c => c.toUpperCase().includes('JOBNAME') || c.toUpperCase() === 'JOB')) {
      jobTabs.push({ table: tbl, data: t.getData()[0] });
    }
  } catch (e) {}
}
out.jobTabs = jobTabs;

fs.writeFileSync('schema_dump.json', JSON.stringify(out, null, 2));
