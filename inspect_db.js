const fs = require('fs');
const MDBReader = require('mdb-reader').default;

const buffer = fs.readFileSync('./BUD-16-SYS-009-26-03-26.ACCDB');
const reader = new MDBReader(buffer);

const tableNames = reader.getTableNames();
console.log("Table names:");
console.log(tableNames.join('\n'));
