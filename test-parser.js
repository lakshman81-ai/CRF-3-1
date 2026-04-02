const fs = require('fs');
const ParserMDB = require('./viewer/parser/accdb-mdb.js');

async function test() {
  const buffer = fs.readFileSync('./BUD-16-SYS-009-26-03-26.ACCDB');
  const result = await ParserMDB.parse(buffer.buffer);
  console.log("Stresses count:", result.stresses ? result.stresses.length : 0);
  console.log("Displacements count:", result.displacements ? result.displacements.length : 0);

  if (result.stresses && result.stresses.length > 0) {
     console.log("First stress:", result.stresses[0]);
  }
}
test().catch(console.error);
