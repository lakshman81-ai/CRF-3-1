const fs = require('fs');
const MDBReader = require('mdb-reader');

function inspectdb(filePath) {
  const buf = fs.readFileSync(filePath);
  const reader = new MDBReader(buf);
  const tables = reader.getTableNames();
  
  console.log('----- ' + filePath + ' -----');
  console.log('Tables:', tables.join(', '));
  
  // Look for JOBNAME
  for (const t of tables) {
    try {
      const dbTable = reader.getTable(t);
      const cols = dbTable.getColumnNames();
      if (cols.some(c => c.toUpperCase() === 'JOBNAME' || c.toUpperCase() === 'JOB_NAME')) {
        console.log(`Found JOBNAME in table ${t}. Cols: ${cols.join(', ')}`);
        console.log(dbTable.getData().slice(0, 1));
      }
    } catch {}
  }
  
  // Look for Flange/output_flange
  for (const t of tables) {
    if (t.toLowerCase().includes('flange')) {
      console.log(`\nFound FLANGE table: ${t}`);
      try {
        const dbTable = reader.getTable(t);
        console.log(`Cols: ${dbTable.getColumnNames().join(', ')}`);
        console.log(`Data (first 3):`, dbTable.getData().slice(0, 3));
      } catch(e) { console.log('cant read', e.message); }
    }
  }
}

inspectdb('RELIEF-FLANGED.ACCDB');
inspectdb('SYS-RDG-006-2.accdb');
