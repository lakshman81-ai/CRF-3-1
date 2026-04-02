import fs from 'fs';
import { parseBinaryAccdb } from './viewer/parser/accdb-mdb.js';

async function test() {
  const buffer = fs.readFileSync('./BUD-16-SYS-009-26-03-26.ACCDB');
  const log = [];
  const result = await parseBinaryAccdb(buffer.buffer, 'test.accdb', log);
  console.log("Stresses count:", result.stresses ? result.stresses.length : 0);
  console.log("Displacements count:", result.displacements ? result.displacements.length : 0);

  if (result.stresses && result.stresses.length > 0) {
     console.log("First stress:");
     console.log(result.stresses[0]);
  }
}
test().catch(console.error);
